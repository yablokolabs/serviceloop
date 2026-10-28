import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { fallbackLimitPerHour, fallbackSlotsLeft } from '../../apps/api/src/modelFallback.js';

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

// Keys are never sent anywhere: fetch is stubbed below. The values only
// satisfy the key loaders so the tests behave identically with or without
// a local env file.
process.env.META_API_KEY = process.env.META_API_KEY || 'test-meta-key';
process.env.BASETEN_API_KEY = process.env.BASETEN_API_KEY || 'test-baseten-key';

async function boot() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-fb-')), 'api.db');
  const srv = createServer({
    dbPath,
    workshopDate: '2026-10-31',
    timezone: 'Asia/Kolkata',
    interpretMode: 'live',
    testMode: true,
  });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, ...((await r.json()) as any) }));
  return { post };
}

const PATCH = {
  intent: 'book',
  additions: [
    { field: 'serviceDate', value: '2026-10-31' },
    { field: 'serviceWindow', value: 'morning' },
    { field: 'pickupRequired', value: true },
    { field: 'pickupTime', value: '10:00' },
  ],
  supersessions: ['serviceDate', 'serviceWindow', 'pickupRequired', 'pickupTime'],
  revocations: [],
  unresolvedFields: [],
  suggestedTool: 'list_slots',
};

const realFetch = globalThis.fetch;
let metaStatus = 429;
let basetenMode: 'patch' | 'variant' = 'patch';
let basetenCalls = 0;

beforeAll(() => {
  globalThis.fetch = (async (url: unknown, init?: unknown) => {
    const u = String(url);
    if (u.includes('api.meta.ai')) return { ok: false, status: metaStatus } as unknown as Response;
    if (u.includes('inference.baseten.co')) {
      basetenCalls += 1;
      const content = basetenMode === 'patch' ? JSON.stringify(PATCH) : JSON.stringify({ variant: 'A' });
      return {
        ok: true,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
            model: 'meta-models/muse-spark-open-1026',
          }),
      } as unknown as Response;
    }
    return realFetch(url as string, init as RequestInit);
  }) as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = realFetch;
});

describe('Baseten quota fallback', () => {
  test('a non-quota Meta failure never falls back and stays honest', async () => {
    metaStatus = 500;
    basetenCalls = 0;
    const { post } = await boot();
    const r = await post('/api/turns', { conversationId: 'fb-500', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    expect(r.interpreter).toBe('muse-spark-1.3');
    expect(r.routingReason).toContain('inference call failed');
    expect(r.question).toContain('could not interpret');
    expect(r.candidates ?? null).toBe(null);
    expect(basetenCalls).toBe(0);
  });

  test('a Meta quota failure falls back to Baseten with an honest label', async () => {
    metaStatus = 429;
    basetenMode = 'patch';
    const { post } = await boot();
    const r = await post('/api/turns', { conversationId: 'fb-429', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    expect(r.interpreter).toContain('baseten:meta-models/muse-spark-open-1026');
    expect(r.interpreter).toContain('meta quota fallback');
    expect(r.routingReason).toContain('Meta quota/auth failure');
    // Fallback output still passes schema validation and books nothing itself.
    expect((r.candidates ?? []).length).toBe(1);
    expect(r.booking ?? null).toBe(null);
  });

  test('the social contributor falls back for the variant choice only', async () => {
    metaStatus = 429;
    basetenMode = 'variant';
    const { post } = await boot();
    const r = await post('/api/turns', { conversationId: 'fb-hi', text: 'hi', nowIso: REF });
    expect(r.interpreter).toContain('baseten:meta-models/muse-spark-open-1026');
    expect(r.question).toContain('ServiceLoop');
    expect(r.ledgerRev).toBe(0);
  });

  test('past the hourly cap the fallback stops and the outage stays honest', async () => {
    metaStatus = 429;
    basetenMode = 'patch';
    const saved = process.env.FALLBACK_LIMIT_PER_HOUR;
    // Allow exactly one more fallback on top of whatever earlier tests used.
    const used = fallbackLimitPerHour() - fallbackSlotsLeft();
    process.env.FALLBACK_LIMIT_PER_HOUR = String(used + 1);
    try {
      const { post } = await boot();
      const first = await post('/api/turns', { conversationId: 'fb-cap1', text: 'service Saturday morning with pickup at 10', nowIso: REF });
      expect(first.interpreter).toContain('meta quota fallback');
      const second = await post('/api/turns', { conversationId: 'fb-cap2', text: 'service Saturday morning with pickup at 10', nowIso: REF });
      expect(second.interpreter).not.toContain('baseten');
      expect(second.interpreter).toBe('muse-spark-1.3');
      expect(second.routingReason).toContain('inference call failed');
    } finally {
      if (saved === undefined) delete process.env.FALLBACK_LIMIT_PER_HOUR;
      else process.env.FALLBACK_LIMIT_PER_HOUR = saved;
    }
  });
});
