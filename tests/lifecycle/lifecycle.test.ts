import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';

const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot() {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-life-')), 'life.db');
  const srv = createServer({
    dbPath,
    workshopDate: '2026-10-31',
    timezone: 'Asia/Kolkata',
    testMode: true,
  });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
  const get = (path: string) =>
    fetch(`http://127.0.0.1:${port}${path}`).then(async (r) => ({ status: r.status, body: (await r.json()) as any }));
  return { post, get };
}

async function bookedConvo(post: any, convo: string) {
  const t = await post('/api/turns', {
    conversationId: convo,
    text: 'service Saturday morning with pickup at 10',
    nowIso: '2026-10-26T09:00:00+05:30',
  });
  const p = await post('/api/proposals', { conversationId: convo, candidateId: t.body.candidates[0].id });
  const c = await post('/api/confirm', {
    proposalId: p.body.proposalId,
    approvalToken: p.body.approvalToken,
    idempotencyKey: `life-${convo}`,
  });
  return { proposal: p.body, confirm: c.body };
}

describe('deterministic workshop offers', () => {
  test('eligible offer applies percent with cap', async () => {
    const { post } = await boot();
    const r = await post('/api/offers/quote', { conversationId: 'o1', offerCode: 'WELCOME10', serviceType: 'full' });
    expect(r.body.eligible).toBe(true);
    expect(r.body.finalPriceGbp).toBe(479);
    expect(JSON.stringify(r.body.reasons)).toMatch(/cap/i);
  });

  test('expired and unknown offers fail closed with reasons', async () => {
    const { post } = await boot();
    const e = await post('/api/offers/quote', { conversationId: 'o2', offerCode: 'EXPIRED5', serviceType: 'basic' });
    expect(e.body.eligible).toBe(false);
    const u = await post('/api/offers/quote', { conversationId: 'o2', offerCode: 'NOPE', serviceType: 'basic' });
    expect(u.body.eligible).toBe(false);
  });

  test('approval-gated offer needs staff key, then applies', async () => {
    const { post } = await boot();
    const q1 = await post('/api/offers/quote', { conversationId: 'o3', offerCode: 'STAFF20', serviceType: 'basic' });
    expect(q1.body.eligible).toBe(false);
    expect(q1.body.needsStaffApproval).toBe(true);
    const bad = await post('/api/offers/approve', { conversationId: 'o3', offerCode: 'STAFF20', staffKey: 'wrong' });
    expect(bad.status).toBe(403);
    const ok = await post('/api/offers/approve', { conversationId: 'o3', offerCode: 'STAFF20', staffKey: 'staff-demo' });
    expect(ok.body.ok).toBe(true);
    const q2 = await post('/api/offers/quote', { conversationId: 'o3', offerCode: 'STAFF20', serviceType: 'basic' });
    expect(q2.body.eligible).toBe(true);
    expect(q2.body.finalPriceGbp).toBe(119);
  });

  test('no endpoint creates or overrides offers', async () => {
    const { post } = await boot();
    const r = await post('/api/offers/create', { code: 'FREE100', pct: 100 });
    expect(r.status).toBe(404);
  });

  test('approval binds exact price; re-quote invalidates the old approval', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'o5',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    const cid = t.body.candidates[0].id;
    const p1 = await post('/api/proposals', { conversationId: 'o5', candidateId: cid, offerCode: 'WELCOME10' });
    expect(p1.body.finalPriceGbp).toBe(134);
    const p2 = await post('/api/proposals', { conversationId: 'o5', candidateId: cid });
    const stale = await post('/api/confirm', {
      proposalId: p1.body.proposalId,
      approvalToken: p1.body.approvalToken,
      idempotencyKey: 'life-o5',
    });
    expect(stale.body.ok).toBe(false);
    const fresh = await post('/api/confirm', {
      proposalId: p2.body.proposalId,
      approvalToken: p2.body.approvalToken,
      idempotencyKey: 'life-o5',
    });
    expect(fresh.body.ok).toBe(true);
    expect(fresh.body.finalPriceGbp).toBe(149);
  });
});

describe('service completion and feedback', () => {
  test('one feedback request, negative feedback opens staff review without refund', async () => {
    const { post, get } = await boot();
    await bookedConvo(post, 'f1');
    const s1 = await post('/api/service-completed', { conversationId: 'f1' });
    expect(s1.body.duplicate ?? false).toBe(false);
    const s2 = await post('/api/service-completed', { conversationId: 'f1' });
    expect(s2.body.duplicate).toBe(true);
    await post('/api/jobs/tick', { nowMs: Date.parse('2026-10-31T20:00:00+05:30') });
    const inbox = await get('/api/inbox?conversationId=f1');
    expect(inbox.body.messages.length).toBe(1);
    const fb = await post('/api/feedback', { conversationId: 'f1', rating: 2, text: 'late pickup' });
    expect(JSON.stringify(fb.body).toLowerCase()).toMatch(/no automatic refund|staff.*review/);
    const tasks = await get('/api/review-tasks?conversationId=f1');
    expect(tasks.body.tasks.length).toBe(1);
    expect(tasks.body.tasks[0].status).toBe('open');
    await post('/api/optout', { conversationId: 'f1' });
    await post('/api/jobs/tick', { nowMs: Date.parse('2026-11-01T20:00:00+05:30') });
    const inbox2 = await get('/api/inbox?conversationId=f1');
    expect(inbox2.body.messages.length).toBe(1);
  });

  test('winback: staff-approved discount delivers, silence triggers blocker probe, complaint opens review', async () => {
    const { post, get } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'w1',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    await post('/api/proposals', { conversationId: 'w1', candidateId: t.body.candidates[0].id });
    // No staff approval yet: the lure must not be sent.
    await post('/api/jobs/tick', { nowMs: Date.now() + 31 * 60000 });
    let inbox = await get('/api/inbox?conversationId=w1');
    expect(inbox.body.messages.length).toBe(0);
    const ap = await post('/api/offers/approve', { conversationId: 'w1', offerCode: 'WINBACK10', staffKey: 'staff-demo' });
    expect(ap.body.ok).toBe(true);
    await post('/api/jobs/tick', { nowMs: Date.now() + 40 * 60000 });
    inbox = await get('/api/inbox?conversationId=w1');
    expect(inbox.body.messages.some((m: { text: string }) => m.text.includes('WINBACK10'))).toBe(true);
    // Still silent: stage 2 asks what is blocking them.
    await post('/api/jobs/tick', { nowMs: Date.now() + 75 * 60000 });
    inbox = await get('/api/inbox?conversationId=w1');
    expect(inbox.body.messages.some((m: { text: string }) => m.text.includes('what is stopping you'))).toBe(true);
    // Complaint reply: persisted review task, no automatic refund.
    const r = await post('/api/turns', {
      conversationId: 'w1',
      text: 'your last service was terrible and the staff were rude',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    expect(r.body.question).toContain('staff review');
    const tasks = await get('/api/review-tasks?conversationId=w1');
    expect(tasks.body.tasks.length).toBe(1);
    expect(tasks.body.tasks[0].status).toBe('open');
  });

  test('winback: opt-out suppresses the lure; price reply quotes the deterministic discount', async () => {
    const { post, get } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'w2',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    await post('/api/proposals', { conversationId: 'w2', candidateId: t.body.candidates[0].id });
    await post('/api/offers/approve', { conversationId: 'w2', offerCode: 'WINBACK10', staffKey: 'staff-demo' });
    await post('/api/optout', { conversationId: 'w2' });
    await post('/api/jobs/tick', { nowMs: Date.now() + 31 * 60000 });
    const inbox = await get('/api/inbox?conversationId=w2');
    expect(inbox.body.messages.length).toBe(0);

    // Fresh boot for w3: w2's live hold correctly blocks the shared slot.
    const b3 = await boot();
    const post3 = b3.post;
    const t3 = await post3('/api/turns', {
      conversationId: 'w3',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    await post3('/api/proposals', { conversationId: 'w3', candidateId: t3.body.candidates[0].id });
    await post3('/api/offers/approve', { conversationId: 'w3', offerCode: 'WINBACK10', staffKey: 'staff-demo' });
    const r = await post3('/api/turns', {
      conversationId: 'w3',
      text: 'this is too expensive for me',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    expect(r.body.question).toContain('WINBACK10');
    expect(r.body.question).toContain('134');
  });

  test('outbound annual reminder delivers first; opt-out and booked suppress it', async () => {
    const { post, get } = await boot();
    const r = await post('/api/reminders/schedule', { conversationId: 'r1' });
    expect(r.body.ok).toBe(true);
    const inbox = await get('/api/inbox?conversationId=r1');
    expect(inbox.body.messages.some((m: { text: string }) => m.text.includes('annual car service is due'))).toBe(true);

    await post('/api/turns', {
      conversationId: 'r2',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    await post('/api/optout', { conversationId: 'r2' });
    const r2 = await post('/api/reminders/schedule', { conversationId: 'r2' });
    expect(r2.body.delivered).toBe(0);
    const inbox2 = await get('/api/inbox?conversationId=r2');
    expect(inbox2.body.messages.some((m: { text: string }) => m.text.includes('annual car service is due'))).toBe(false);

    const bk = await bookedConvo(post, 'r3');
    expect(bk.confirm.ok).toBe(true);
    const r3 = await post('/api/reminders/schedule', { conversationId: 'r3' });
    expect(r3.body.delivered).toBe(0);
  });

  test('blocker follow-up is bounded and opt-out suppressed', async () => {
    const { post, get } = await boot();
    await post('/api/turns', {
      conversationId: 'b1',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-10-26T09:00:00+05:30',
    });
    const r = await post('/api/followup/blocker', { conversationId: 'b1' });
    expect(r.body.jobId.length).toBeGreaterThan(0);
    await post('/api/optout', { conversationId: 'b1' });
    const t = await post('/api/jobs/tick', { nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    expect(t.body.delivered).toBe(0);
    const inbox = await get('/api/inbox?conversationId=b1');
    expect(inbox.body.messages.length).toBe(0);
  });
});
