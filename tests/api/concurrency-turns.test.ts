import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';

// Review finding 3: two in-flight turns must never both land at the same
// ledger revision. Interpretation is stubbed at fetch with a delay, so
// both turns load revision 0 before either saves.

process.env.META_API_KEY = process.env.META_API_KEY || 'test-meta-key';

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

const realFetch = globalThis.fetch;

function patchFor(text: string) {
  if (text.includes('SETDATE')) {
    return {
      intent: 'book',
      additions: [
        { field: 'serviceDate', value: '2026-10-31' },
        { field: 'serviceWindow', value: 'morning' },
      ],
      supersessions: [],
      revocations: [],
      unresolvedFields: [],
      suggestedTool: 'list_slots',
    };
  }
  return {
    intent: 'book',
    additions: [
      { field: 'pickupRequired', value: true },
      { field: 'pickupTime', value: '10:00' },
    ],
    supersessions: [],
    revocations: [],
    unresolvedFields: [],
    suggestedTool: 'list_slots',
  };
}

describe('concurrent turns on one conversation', () => {
  test('both changes commit, each advancing the revision once', async () => {
    globalThis.fetch = (async (input: any, init: any) => {
      const url = String(input);
      if (url.startsWith('http://127.0.0.1')) return realFetch(input, init);
      // Meta interpretation call: slow down so the two turns overlap.
      await new Promise((r) => setTimeout(r, 200));
      const body = JSON.parse(String(init?.body ?? '{}'));
      const text = body.messages?.[body.messages.length - 1]?.content ?? '';
      const payload = {
        choices: [{ message: { content: JSON.stringify(patchFor(text)) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      };
      return {
        ok: true,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      } as any;
    }) as any;
    try {
      const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-cc-')), 'api.db');
      const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata', interpretMode: 'live', testMode: true });
      const port = await srv.listen(0);
      servers.push(srv);
      const post = (path: string, body: unknown) =>
        fetch(`http://127.0.0.1:${port}${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }).then(async (r) => ({ status: r.status, ...((await r.json()) as any) }));
      const get = (path: string) =>
        fetch(`http://127.0.0.1:${port}${path}`).then(async (r) => ({ status: r.status, ...((await r.json()) as any) }));

      const [a, b] = await Promise.all([
        post('/api/turns', { conversationId: 'cc1', text: 'SETDATE please', nowIso: REF }),
        post('/api/turns', { conversationId: 'cc1', text: 'pickup please', nowIso: REF }),
      ]);
      expect(a.status).toBe(200);
      expect(b.status).toBe(200);
      const st = await get('/api/conversation/cc1');
      // Nothing lost, and the revision counted both turns.
      expect(st.ledgerRev).toBe(2);
      expect(st.active.serviceDate).toBe('2026-10-31');
      expect(st.active.pickupTime).toBe('10:00');
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});
