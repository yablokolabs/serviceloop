// Direct Meta inference client. Verified contracts from
// evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md. No other providers.
import { readFileSync } from 'node:fs';
import { parse } from 'dotenv';

const BASE = 'https://api.meta.ai/v1';

let cachedKey: string | null = null;

function key(): string {
  if (cachedKey) return cachedKey;
  // Parse only META_API_KEY. Never inject the whole env file into process.env.
  // Env var is fallback only (CI secrets); the local file stays primary.
  let k = (process.env.META_API_KEY ?? '').trim();
  try {
    const parsed = parse(readFileSync('/home/azureuser/.hermes/.env', 'utf8'));
    k = (parsed.META_API_KEY ?? '').trim().replace(/^"|"$/g, '') || k;
  } catch {
    // No local env file (e.g. CI runner): env var only.
  }
  if (!k) throw new Error('META_API_KEY missing');
  cachedKey = k;
  return k;
}

export interface ChatUsage {
  prompt: number;
  completion: number;
  total: number;
  reasoning: number;
}

export interface ChatResult {
  text: string;
  finishReason: string;
  latencyMs: number;
  usage: ChatUsage;
  model: string;
}

export async function chat(
  model: 'muse-spark-1.3' | 'muse-wonder-1.0' | 'muse-spark-1.3-contributor',
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number },
): Promise<ChatResult> {
  const started = Date.now();
  const r = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key()}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      messages,
      max_completion_tokens: opts?.maxTokens ?? 600,
      reasoning_effort: 'minimal',
    }),
  });
  if (!r.ok) throw new Error(`meta chat ${r.status}`);
  const j = (await r.json()) as {
    choices: { message: { content: string }; finish_reason: string }[];
    usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number; reasoning_tokens?: number };
  };
  return {
    text: j.choices[0]?.message?.content ?? '',
    finishReason: j.choices[0]?.finish_reason ?? '',
    latencyMs: Date.now() - started,
    usage: {
      prompt: j.usage.prompt_tokens,
      completion: j.usage.completion_tokens,
      total: j.usage.total_tokens,
      reasoning: j.usage.reasoning_tokens ?? 0,
    },
    model,
  };
}

export async function transcribe(wav: Buffer): Promise<{ text: string; latencyMs: number }> {
  const started = Date.now();
  const session = `serviceloop-${Date.now()}`;
  const form = new FormData();
  form.append(
    'request',
    JSON.stringify({ audioEncoding: 'WAV', mode: 'PUSH_TO_TALK', model: 'muse-voice-transcribe-1.0' }),
  );
  form.append('audio', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'note.wav');
  const r = await fetch(`${BASE}/asr/transcribe?sessionId=${session}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key()}` },
    body: form,
  });
  if (!r.ok) throw new Error(`meta asr ${r.status}`);
  const j = (await r.json()) as { transcript?: string; text?: string };
  return { text: j.transcript ?? j.text ?? '', latencyMs: Date.now() - started };
}
