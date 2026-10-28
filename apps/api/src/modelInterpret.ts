// Live model interpretation. Spark first; Wonder once on ambiguity or parse
// failure; then human clarification. Every route is labeled. Failures and
// invalid output never change ledger state and never book.
import { ModelPatchSchema, TOOL_NAMES } from '../../../packages/domain/src/schemas.js';
import { chat } from '../../../packages/meta/src/client.js';
import type { ExtractedPatch } from './extract.js';

export interface CallUsage {
  prompt: number;
  completion: number;
  total: number;
}

export interface InterpretResult {
  patch: ExtractedPatch;
  interpreter: string;
  routingReason: string;
  modelError?: string;
  usage?: CallUsage;
  latencyMs?: number;
}

const SYSTEM = `You interpret car-workshop booking messages (automotive maintenance: service bay, pickup driver). Never taxi or transport.
Reference time and timezone are given per message. Resolve weekdays against the reference date.
Rules: 11 AM counts as morning. An explicit pickup time (e.g. 08:30) is the pickup, never the service start. Bare "before ten" with no event is ambiguous.
Use EXACT field names: serviceDate (YYYY-MM-DD), serviceWindow (morning, afternoon or evening), serviceStartBefore (HH), pickupRequired (boolean), pickupTime (HH:MM). Never snake_case.
Reply with JSON only: {"intent": string, "additions": [{"field": string, "value": unknown}], "supersessions": [string], "revocations": [string], "unresolvedFields": [string], "userVisibleQuestion": string, "suggestedTool": "list_slots"}.
Suggested tool is always list_slots. No other text.`;

function toPatch(j: unknown): ExtractedPatch | null {
  const r = ModelPatchSchema.safeParse(j);
  if (!r.success) return null;
  const v = r.data;
  return {
    additions: v.additions.map((a) => ({ field: a.field, value: a.value, scope: 'booking' as const })),
    supersessions: v.supersessions,
    revocations: v.revocations,
    unresolvedFields: v.unresolvedFields,
  };
}

function parseJsonLoose(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]);
    } catch {
      return null;
    }
  }
}

const FIELD_ALIASES: Record<string, string> = {
  service_date: 'serviceDate',
  service_time_window: 'serviceWindow',
  service_window: 'serviceWindow',
  service_start_before: 'serviceStartBefore',
  pickup_required: 'pickupRequired',
  pickup_time: 'pickupTime',
};

const KNOWN_FIELDS = new Set([
  'serviceDate',
  'serviceWindow',
  'serviceStartBefore',
  'pickupRequired',
  'pickupTime',
  'preferredWorkshop',
  'contactChannel',
  'callbackAt',
  'notificationConsent',
]);

export type ModelBackend = 'meta' | 'baseten';

async function runChat(
  backend: ModelBackend,
  model: 'muse-spark-1.3' | 'muse-wonder-1.0',
  messages: { role: string; content: string }[],
): Promise<{ text: string }> {
  if (backend === 'baseten') {
    const { basetenChat } = await import('../../../packages/meta/src/baseten.js');
    return basetenChat(messages, {
      maxTokens: 1000,
      extra: { reasoning_effort: 'minimal' },
      responseFormat: { type: 'json_schema', json_schema: { name: 'patch', schema: { type: 'object' } } },
    });
  }
  return chat(model, messages, { maxTokens: 600 });
}

function interpreterLabel(backend: ModelBackend, model: 'muse-spark-1.3' | 'muse-wonder-1.0'): string {
  return backend === 'baseten' ? 'baseten:meta-models/muse-spark-open-1026' : model;
}

export function parseModelOutput(text: string): ExtractedPatch | null {
  const raw = parseJsonLoose(text) as {
    intent?: unknown;
    suggestedTool?: unknown;
    additions?: { field: string; value: unknown }[];
    supersessions?: string[];
    revocations?: string[];
    unresolvedFields?: string[];
  } | null;
  if (!raw) return null;
  // Fail closed: no intent or no valid tool means malformed output, not an empty patch.
  if (typeof raw.intent !== 'string') return null;
  if (typeof raw.suggestedTool !== 'string' || !(TOOL_NAMES as readonly string[]).includes(raw.suggestedTool)) {
    return null;
  }
  // Only known booking fields may ask for clarification. Anything else the
  // model invents (a time, a phrase) is dropped, never rendered to the
  // customer as a clarification request.
  const KNOWN_UNRESOLVED = new Set([
    'serviceDate',
    'serviceWindow',
    'serviceStartBefore',
    'pickupRequired',
    'pickupTime',
    'timeReference',
    'domain',
  ]);
  const unresolved = [...(raw.unresolvedFields ?? [])].filter((f) => KNOWN_UNRESOLVED.has(f));
  const additions: { field: string; value: unknown }[] = [];
  for (const a of raw.additions ?? []) {
    const field = FIELD_ALIASES[a.field] ?? a.field;
    if (!KNOWN_FIELDS.has(field)) {
      unresolved.push(`unknown-field:${a.field}`);
      continue;
    }
    additions.push({ field, value: a.value });
  }
  const patch = toPatch({
    intent: 'normalize',
    additions,
    supersessions: raw.supersessions ?? [],
    revocations: raw.revocations ?? [],
    unresolvedFields: unresolved,
    suggestedTool: 'list_slots',
  });
  return patch;
}

export async function liveInterpret(
  text: string,
  nowIso: string,
  tz: string,
  backend: ModelBackend = 'meta',
): Promise<InterpretResult> {
  const user = `Reference: ${nowIso} in ${tz}. Message: ${text}`;
  const sparkLabel = interpreterLabel(backend, 'muse-spark-1.3');
  const wonderLabel = interpreterLabel(backend, 'muse-wonder-1.0');
  const started = Date.now();
  const usage: CallUsage = { prompt: 0, completion: 0, total: 0 };
  const addUsage = (u?: CallUsage) => {
    if (u) {
      usage.prompt += u.prompt;
      usage.completion += u.completion;
      usage.total += u.total;
    }
  };
  try {
    const spark = await runChat(backend, 'muse-spark-1.3', [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ]);
    addUsage((spark as { usage?: CallUsage }).usage);
    const valid = parseModelOutput(spark.text);
    if (valid && valid.unresolvedFields.length === 0) {
      return { patch: valid, interpreter: sparkLabel, routingReason: 'routine interpretation, no ambiguity', usage, latencyMs: Date.now() - started };
    }
    const wonder = await runChat(backend, 'muse-wonder-1.0', [
      { role: 'system', content: `${SYSTEM} The first pass was ambiguous or invalid. Resolve conflicts explicitly: keep 11 AM active under "morning", keep explicit pickup times on pickup, and list every unresolved time reference.` },
      { role: 'user', content: user },
    ]);
    addUsage((wonder as { usage?: CallUsage }).usage);
    const wvalid = parseModelOutput(wonder.text);
    if (wvalid) {
      return { patch: wvalid, interpreter: wonderLabel, routingReason: 'ambiguity or invalid first pass, escalated once', usage, latencyMs: Date.now() - started };
    }
    return {
      patch: { additions: [], supersessions: [], revocations: [], unresolvedFields: ['free-text'] },
      interpreter: wonderLabel,
      routingReason: 'both passes unparseable, asking human',
      modelError: 'model output failed schema validation twice',
    };
  } catch (e) {
    return {
      patch: { additions: [], supersessions: [], revocations: [], unresolvedFields: ['free-text'] },
      interpreter: sparkLabel,
      routingReason: 'inference call failed, asking human',
      modelError: String(e),
    };
  }
}
