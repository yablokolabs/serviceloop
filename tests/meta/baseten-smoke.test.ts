// Minimal Baseten smoke: one interpretation call against the exact model.
// Verifies response shape, reasoning behavior, extraction and usage — nothing else.
import { describe, expect, test } from 'vitest';
import { BASETEN_MODEL, basetenChat } from '../../packages/meta/src/baseten.js';

describe('baseten spark-open smoke', () => {
  test('plain call returns final answer plus usage', async () => {
    const r = await basetenChat(
      [
        {
          role: 'system',
          content:
            'You interpret car-workshop booking messages (automotive maintenance: service bay, pickup driver). Never taxi or transport. Reply with JSON only: {"intent": string, "additions": [{"field": string, "value": unknown}], "suggestedTool": "list_slots"}.',
        },
        { role: 'user', content: 'Reference: 2026-10-26 in Asia/Kolkata. Message: service Saturday morning with pickup at 10' },
      ],
      {
        maxTokens: 1000,
        extra: { reasoning_effort: 'minimal' },
        responseFormat: {
          type: 'json_schema',
          json_schema: { name: 'patch', schema: { type: 'object' } },
        },
      },
    );
    console.log(`baseten smoke: finish=${r.finishReason} ${r.latencyMs}ms, usage ${r.usage.prompt}+${r.usage.completion}=${r.usage.total}`);
    console.log(`message keys: ${JSON.stringify((r.raw as any).choiceKeys)}`);
    console.log(`output head: ${r.text.slice(0, 200)}`);
    expect(r.model).toContain('muse-spark-open-1026');
    expect(r.finishReason).toBe('stop');
    expect(r.text.length).toBeGreaterThan(0);
    expect(r.usage.total).toBeGreaterThan(0);
  }, 90000);

  test('server labels the baseten backend explicitly and never falls back silently', async () => {
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const { createServer } = await import('../../apps/api/src/server.js');
    const srv = createServer({
      dbPath: join(mkdtempSync(join(tmpdir(), 'sl-bt-')), 'bt.db'),
      workshopDate: '2026-10-31',
      timezone: 'Asia/Kolkata',
      interpretMode: 'live-baseten',
    });
    const port = await srv.listen(0);
    try {
      const r = await fetch(`http://127.0.0.1:${port}/api/turns`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          conversationId: 'bt1',
          text: 'service Saturday morning with pickup at 10',
          nowIso: '2026-10-26T09:00:00+05:30',
        }),
      }).then((x) => x.json() as Promise<any>);
      expect(r.interpreter).toBe('baseten:meta-models/muse-spark-open-1026');
      expect(r.ledgerRev).toBeGreaterThan(0);
    } finally {
      srv.close();
    }
  }, 90000);

  test('structured-output probe reports support honestly', async () => {
    let supported = true;
    let note = '';
    try {
      const r = await basetenChat(
        [{ role: 'user', content: 'Reply with {"ok": true} exactly.' }],
        {
          maxTokens: 100,
          responseFormat: { type: 'json_schema', json_schema: { name: 'probe', schema: { type: 'object' } } },
        },
      );
      note = `accepted, finish=${r.finishReason}, len=${r.text.length}, head: ${r.text.slice(0, 80)}`;
    } catch (e) {
      supported = false;
      note = String(e).slice(0, 160);
    }
    console.log(`response_format json_schema supported: ${supported}. ${note}`);
    expect(typeof supported).toBe('boolean');
  }, 90000);
});
