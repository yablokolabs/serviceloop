// Modal Muse client: Meta's Muse Spark Open served by Modal's Shared
// Endpoints (OpenAI-compatible chat completions). Server-side only, used
// solely as the last leg of the quota-fallback chain. Verified 2026-10-28:
// auth is a proxy token as `Bearer <id>.<secret>`; reasoning arrives in a
// separate `reasoning_content` field and is never logged or stored;
// `reasoning_effort: low` is the minimum accepted ('minimal' is rejected);
// `response_format: json_schema` is supported.
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

export const MODAL_MODEL = 'meta-models/Muse-Spark-Open-816B-A42B';
const DEFAULT_URL = 'https://yablokolabs--ep-hermes-muse-server.us-west.modal.direct';

export function modalUrl(): string {
  return (process.env.MODAL_MUSE_URL ?? '').trim() || DEFAULT_URL;
}

let cachedAuth: string | null = null;

export function modalAuth(): string {
  if (cachedAuth) return cachedAuth;
  // Proxy token id + secret. Local file stays primary, env vars fallback
  // (CI secrets); both the repo's names and Modal's documented names work.
  let id = (process.env.MODAL_PROXY_KEY ?? process.env.MODAL_PROXY_TOKEN_ID ?? '').trim();
  let secret = (process.env.MODAL_PROXY_SECRET ?? process.env.MODAL_PROXY_TOKEN_SECRET ?? '').trim();
  try {
    const parsed = parse(readFileSync('/home/azureuser/.hermes/.env', 'utf8'));
    const clean = (v: unknown) => String(v ?? '').trim().replace(/^"|"$/g, '');
    id = clean(parsed.MODAL_PROXY_KEY ?? parsed.MODAL_PROXY_TOKEN_ID) || id;
    secret = clean(parsed.MODAL_PROXY_SECRET ?? parsed.MODAL_PROXY_TOKEN_SECRET) || secret;
  } catch {
    // No local env file (e.g. CI runner): env vars only.
  }
  if (!id || !secret) throw new Error('MODAL_PROXY_KEY/MODAL_PROXY_SECRET missing');
  cachedAuth = `${id}.${secret}`;
  return cachedAuth;
}

export interface ModalChatResult {
  text: string;
  finishReason: string;
  latencyMs: number;
  usage: { prompt: number; completion: number; total: number };
  model: string;
}

export async function modalChat(
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number; responseFormat?: object },
): Promise<ModalChatResult> {
  const started = Date.now();
  const body: Record<string, unknown> = {
    model: MODAL_MODEL,
    messages,
    max_completion_tokens: opts?.maxTokens ?? 2000,
    reasoning_effort: 'low',
  };
  if (opts?.responseFormat) body.response_format = opts.responseFormat;
  const r = await fetch(`${modalUrl()}/v1/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${modalAuth()}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`modal chat ${r.status}: ${text.slice(0, 200)}`);
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
    model: j.model ?? MODAL_MODEL,
  };
}
