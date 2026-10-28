import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-api-')), 'api.db');
  const srv = createServer({ dbPath, workshopDate: '2026-10-31', timezone: 'Asia/Kolkata' });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json() as Promise<any>);
  return { post };
}

describe('conversation booking flow', () => {
  test('vague Saturday request returns clarification and bumps ledger, books nothing', async () => {
    const { post } = await boot();
    const res = await post('/api/turns', { conversationId: 'c1', text: 'car service Saturday please', nowIso: REF });
    expect(res.ledgerRev).toBeGreaterThan(0);
    expect(res.question.length).toBeGreaterThan(0);
    expect(res.proposal ?? null).toBe(null);
    expect(res.booking ?? null).toBe(null);
  });

  test('full flow: slot to proposal to confirmed booking, idempotent retry', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c2',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates.length).toBeGreaterThan(0);
    const p = await post('/api/proposals', { conversationId: 'c2', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    const c1 = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k1',
    });
    expect(c1.ok).toBe(true);
    const c2 = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k1',
    });
    expect(c2.bookingId).toBe(c1.bookingId);
  });

  test('a booked slot is never proposed again; stale candidate gets 409 slot-taken', async () => {
    const { post } = await boot();
    const t1 = await post('/api/turns', {
      conversationId: 'd1',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const cand = t1.candidates[0];
    const p = await post('/api/proposals', { conversationId: 'd1', candidateId: cand.id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'kd1',
    });
    expect(c.ok).toBe(true);
    const t2 = await post('/api/turns', {
      conversationId: 'd2',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t2.candidates.find((x: { id: string }) => x.id === cand.id)).toBeUndefined();
    const stale = await post('/api/proposals', { conversationId: 'd2', candidateId: cand.id });
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe('slot-taken');
  });

  test('wrong approval token confirms nothing', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c3',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const p = await post('/api/proposals', { conversationId: 'c2', candidateId: t.candidates[0].id });
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: 'wrong-token',
      idempotencyKey: 'k9',
    });
    expect(c.ok).toBe(false);
  });

  test('yes after a constraint change refuses the stale proposal, books nothing', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c6',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const p = await post('/api/proposals', { conversationId: 'c6', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    // Constraint change after the proposal: ledger revision moves, so the
    // open proposal now describes outdated terms (same guard as /api/confirm).
    await post('/api/turns', { conversationId: 'c6', text: 'actually no pickup needed', nowIso: REF });
    const res = await post('/api/turns', { conversationId: 'c6', text: 'yes', nowIso: REF });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('constraints-changed');
    expect(res.booking ?? null).toBe(null);
  });

  test('fragment after complete constraints does not re-ask confirmed fields', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c7',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    // A fragmentary follow-up must be judged against the ledger, not only
    // against what this one message contains: confirmed fields stay answered.
    const frag = await post('/api/turns', { conversationId: 'c7', text: 'service before 10 with pickup', nowIso: REF });
    expect(frag.question ?? '').not.toContain('Before I check availability');
    expect((frag.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('new ambiguous date or cutoff still blocks despite confirmed fields', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c8',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    // "next Saturday" is a fresh ambiguous date: the old date must not
    // silently satisfy it.
    const d = await post('/api/turns', { conversationId: 'c8', text: 'actually next Saturday', nowIso: REF });
    expect(d.question ?? '').toContain('Before I check availability');
    expect(d.candidates ?? []).toHaveLength(0);
    // A different "before" time is new ambiguity; the confirmed 10:00
    // pickup does not ground "before 9".
    const b = await post('/api/turns', { conversationId: 'c8', text: 'service before 9 with pickup', nowIso: REF });
    expect(b.question ?? '').toContain('Before I check availability');
    expect(b.candidates ?? []).toHaveLength(0);
  });

  test('bare yes with no proposal asks for clarification, books nothing', async () => {
    const { post } = await boot();
    const res = await post('/api/turns', { conversationId: 'c4', text: 'yes', nowIso: REF });
    expect(res.booking ?? null).toBe(null);
    expect(res.question.length).toBeGreaterThan(0);
  });

  test('rules-demo turns are labeled, cancel needs the token', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c5',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.interpreter).toBe('rules-demo');
    const p = await post('/api/proposals', { conversationId: 'c5', candidateId: t.candidates[0].id });
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k5',
    });
    expect(c.ok).toBe(true);
    const bad = await post('/api/cancel', { bookingId: c.bookingId, cancelToken: 'nope' });
    expect(bad.ok).toBe(false);
    const good = await post('/api/cancel', { bookingId: c.bookingId, cancelToken: c.cancelToken });
    expect(good.ok).toBe(true);
  });
});
