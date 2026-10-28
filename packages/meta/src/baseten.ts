// Optional Baseten adapter. Server-side only, explicit opt-in, never default.
// Exact model: meta-models/muse-spark-open-1026. No substitution.
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const BASE = 'https://inference.baseten.co/v1';
export const BASETEN_MODEL = 'meta-models/muse-spark-open-1026';

let cachedKey: string | null = null;

export function basetenKey(): string {
  if (cachedKey) return cachedKey;
  // Env var is fallback only (CI secrets); the local file stays primary.
  let k = (process.env.BASETEN_API_KEY ?? '').trim();
  try {
    const parsed = parse(readFileSync('/home/azureuser/.hermes/.env', 'utf8'));
    k = (parsed.BASETEN_API_KEY ?? '').trim().replace(/^"|"$/g, '') || k;
  } catch {
    // No local env file (e.g. CI runner): env var only.
  }
  if (!k) throw new Error('BASETEN_API_KEY missing');
  cachedKey = k;
  return k;
}

export interface BasetenChatResult {
  text: string;
  finishReason: string;
  latencyMs: number;
  usage: { prompt: number; completion: number; total: number };
  model: string;
  raw: unknown;
}

export async function basetenChat(
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number; responseFormat?: object; extra?: Record<string, unknown> },
): Promise<BasetenChatResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: BASETEN_MODEL,
    messages,
    max_completion_tokens: opts?.maxTokens ?? 600,
    ...(opts?.extra ?? {}),
  };
  if (opts?.responseFormat) body.response_format = opts.responseFormat;
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${basetenKey()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`baseten chat ${r.status}: ${text.slice(0, 200)}`);
  const j = JSON.parse(text) as {
    choices: { message: { content: string | null; reasoning_content?: string }; finish_reason: string }[];
    usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    model?: string;
  };
  const msg = j.choices[0]?.message ?? { content: '' };
  return {
    text: msg.content ?? '',
    finishReason: j.choices[0]?.finish_reason ?? '',
    latencyMs: Date.now() - started,
    usage: {
      prompt: j.usage?.prompt_tokens ?? 0,
      completion: j.usage?.completion_tokens ?? 0,
      total: j.usage?.total_tokens ?? 0,
    },
    model: j.model ?? BASETEN_MODEL,
    raw: { reasoningContent: msg.reasoning_content ?? null, choiceKeys: Object.keys(msg) },
  };
}
