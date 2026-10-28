// Live end-to-end: real model interpretation through the real API and solver.
// One Spark call. Rule-based demo path is covered in booking-flow.test.ts.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';

const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

describe('live model turn', () => {
  test('spark patch flows through ledger, solver, proposal, approval', async () => {
    const srv = createServer({
      dbPath: join(mkdtempSync(join(tmpdir(), 'sl-live-')), 'api.db'),
      workshopDate: '2026-10-31',
      timezone: 'Asia/Kolkata',
      interpretMode: 'live',
    });
    const port = await srv.listen(0);
    servers.push(srv);
    const post = (path: string, body: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<any>);

    const t = await post('/api/turns', {
      conversationId: 'live1',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    expect(t.interpreter).toMatch(/muse-(spark|wonder)/);
    expect(t.routingReason.length).toBeGreaterThan(0);
    expect(t.ledgerRev).toBeGreaterThan(0);
    expect(t.candidates.length).toBeGreaterThan(0);

    const p = await post('/api/proposals', { conversationId: 'live1', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'live-k1',
    });
    expect(c.ok).toBe(true);
    expect(c.cancelToken.length).toBeGreaterThan(0);
  }, 90000);

  test('greeting is phrased by muse-spark-1.3-contributor and claims no booking', async () => {
    const srv = createServer({
      dbPath: join(mkdtempSync(join(tmpdir(), 'sl-live-')), 'api.db'),
      workshopDate: '2026-10-31',
      timezone: 'Asia/Kolkata',
      interpretMode: 'live',
    });
    const port = await srv.listen(0);
    servers.push(srv);
    const post = (path: string, body: unknown) =>
      fetch(`http://127.0.0.1:${port}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }).then((r) => r.json() as Promise<any>);

    const t = await post('/api/turns', {
      conversationId: 'live-social1',
      text: 'hi',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    expect(t.interpreter).toBe('muse-spark-1.3-contributor');
    expect(t.question.toLowerCase()).toMatch(/serviceloop|car service/);
    expect(t.question.toLowerCase()).not.toContain('booked');
    expect(t.booking ?? null).toBe(null);
  }, 90000);
});
