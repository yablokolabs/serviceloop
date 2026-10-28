import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer } from '../../apps/api/src/server.js';
import { parseModelOutput } from '../../apps/api/src/modelInterpret.js';

// Regression tests for the 2026-10-28 repository review findings.
// Each test names the finding it pins.

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot(testMode = true) {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-fix-')), 'api.db');
  const srv = createServer({
    dbPath,
    workshopDate: '2026-10-31',
    workshopClosedNote: 'closed Sundays',
    timezone: 'Asia/Kolkata',
    testMode,
  });
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
  return { post, get, dbPath, port };
}

async function bookFirst(post: any, convo: string, text: string, key: string) {
  const t = await post('/api/turns', { conversationId: convo, text, nowIso: REF });
  const p = await post('/api/proposals', { conversationId: convo, candidateId: t.candidates[0].id });
  const c = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: key });
  return { t, p, c };
}

describe('review finding 1: idempotency is bound to its own proposal', () => {
  test('a key replayed against a different proposal is a conflict, not its booking', async () => {
    const { post } = await boot();
    const a = await bookFirst(post, 'i1', 'service Saturday morning with pickup at 10', 'key-shared');
    expect(a.c.ok).toBe(true);
    await post('/api/turns', { conversationId: 'i2', text: 'service Saturday afternoon', nowIso: REF });
    const t2 = await post('/api/turns', { conversationId: 'i2', text: 'no', nowIso: REF });
    const p2 = await post('/api/proposals', { conversationId: 'i2', candidateId: t2.candidates[0].id });
    const replay = await post('/api/confirm', { proposalId: p2.proposalId, approvalToken: p2.approvalToken, idempotencyKey: 'key-shared' });
    expect(replay.status).toBe(409);
    expect(replay.error).toBe('idempotency-key-reused');
    expect(replay.cancelToken ?? null).toBe(null);
    // The second proposal still confirms under its own key.
    const own = await post('/api/confirm', { proposalId: p2.proposalId, approvalToken: p2.approvalToken, idempotencyKey: 'key-own' });
    expect(own.ok).toBe(true);
    expect(own.bookingId).not.toBe(a.c.bookingId);
  });
});

describe('review finding 2: overlapping starts cannot double-book one bay/driver', () => {
  test('a second overlapping pickup/service on the same bay is refused', async () => {
    const { post } = await boot();
    const a = await bookFirst(post, 'o1', 'service Saturday morning with pickup at 10', 'k-o1');
    expect(a.c.ok).toBe(true);
    // Same bay, overlapping services: pickup 10:15 -> service 10:45.
    const t2 = await post('/api/turns', { conversationId: 'o2', text: 'service Saturday morning with pickup at 10:15', nowIso: REF });
    const usable = (t2.candidates ?? []).filter((c: any) => c.serviceStartMin < 11 * 60 + 30 && c.serviceStartMin + 60 > 10 * 60 + 30);
    expect(usable.length).toBe(0);
    if (t2.candidates?.length) {
      const p2 = await post('/api/proposals', { conversationId: 'o2', candidateId: t2.candidates[0].id });
      if (p2.proposalId) {
        const c2 = await post('/api/confirm', { proposalId: p2.proposalId, approvalToken: p2.approvalToken, idempotencyKey: 'k-o2' });
        expect(c2.ok ?? false).toBe(false);
      }
    }
  });
});

describe('review finding 5: confirmation revalidates availability', () => {
  test('closing the bay after a proposal voids its confirmation', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', { conversationId: 'v1', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    const p = await post('/api/proposals', { conversationId: 'v1', candidateId: t.candidates[0].id });
    await post('/api/workshop/close-bay', {});
    const c = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: 'k-v1' });
    expect(c.status).toBe(409);
    expect(c.ok ?? false).toBe(false);
  });
});

describe('review finding 6: same-day past times cannot book', () => {
  test('a morning request made in the afternoon offers nothing bookable', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'p1',
      text: 'service today morning with pickup at 10',
      nowIso: '2026-10-31T15:30:00+05:30',
    });
    expect(t.candidates?.length ?? 0).toBe(0);
    expect(String(t.question ?? '')).toContain('passed');
  });
});

describe('review finding 14: an explicit service time binds exactly', () => {
  test('"at 2pm" without pickup books 14:00, never the 12:00 window start', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'e1', text: 'service Saturday at 2pm', nowIso: REF });
    const t = await post('/api/turns', { conversationId: 'e1', text: 'no', nowIso: REF });
    expect(t.candidates?.length).toBeGreaterThan(0);
    expect(t.candidates[0].serviceStartMin).toBe(14 * 60);
  });
});

describe('review findings 7+8: chat lifecycle actions and durable consent', () => {
  test('"stop messaging me" in chat opts out and cancels scheduled jobs', async () => {
    const { post, get } = await boot();
    const t = await post('/api/turns', { conversationId: 'l1', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    await post('/api/proposals', { conversationId: 'l1', candidateId: t.candidates[0].id });
    const r = await post('/api/turns', { conversationId: 'l1', text: 'stop messaging me, unsubscribe', nowIso: REF });
    expect(String(r.question)).toContain('opted out');
    const st = await get('/api/conversation/l1');
    expect(st.optedOut).toBe(true);
    const jobs = await get('/api/jobs?conversationId=l1');
    expect(jobs.jobs.every((j: any) => j.status !== 'scheduled')).toBe(true);
  });

  test('a snooze after opt-out is refused and consent survives cancellation', async () => {
    const { post, get } = await boot();
    await post('/api/optout', { conversationId: 'l2' });
    const snooze = await post('/api/snooze', { conversationId: 'l2', callbackAt: '2026-10-27T10:00:00+05:30', channel: 'browser' });
    expect(snooze.status).toBe(409);
    const st = await get('/api/conversation/l2');
    expect(st.optedOut).toBe(true);
    expect(st.status).toBe('opted_out');
  });

  test('chat snooze schedules a follow-up without touching consent', async () => {
    const { post, get } = await boot();
    const r = await post('/api/turns', { conversationId: 'l3', text: 'remind me tomorrow please', nowIso: REF });
    expect(String(r.question)).toContain('remind you tomorrow');
    const jobs = await get('/api/jobs?conversationId=l3');
    expect(jobs.jobs.some((j: any) => j.status === 'scheduled')).toBe(true);
    const st = await get('/api/conversation/l3');
    expect(st.status).toBe('snoozed');
  });
});

describe('review finding 9: a chat "yes" booking is cancellable', () => {
  test('yes after a proposal returns the cancel token and booked status', async () => {
    const { post, get } = await boot();
    const t = await post('/api/turns', { conversationId: 'y1', text: 'service Saturday morning with pickup at 10', nowIso: REF });
    await post('/api/proposals', { conversationId: 'y1', candidateId: t.candidates[0].id });
    const y = await post('/api/turns', { conversationId: 'y1', text: 'yes', nowIso: REF });
    expect(y.booking?.bookingId).toBeGreaterThan(0);
    expect(typeof y.booking?.cancelToken).toBe('string');
    expect(y.booking?.candidate?.date).toBe('2026-10-31');
    expect(y.booking?.candidate?.serviceStartMin).toBeGreaterThan(0);
    const st = await get('/api/conversation/y1');
    expect(st.status).toBe('booked');
    const cancel = await post('/api/cancel', { bookingId: y.booking.bookingId, cancelToken: y.booking.cancelToken });
    expect(cancel.ok).toBe(true);
  });
});

describe('review finding 4/B7: model values and bare times are validated', () => {
  test('parseModelOutput drops invalid values into clarification', () => {
    const patch = parseModelOutput(
      JSON.stringify({
        intent: 'book',
        suggestedTool: 'list_slots',
        additions: [
          { field: 'serviceDate', value: '2026-10-31' },
          { field: 'pickupRequired', value: 'yes' },
          { field: 'pickupTime', value: 'nonsense' },
          { field: 'serviceWindow', value: 'night' },
        ],
        supersessions: [],
        revocations: [],
        unresolvedFields: [],
      }),
    );
    expect(patch).not.toBe(null);
    expect(patch!.additions.map((a) => a.field)).toEqual(['serviceDate']);
    expect(patch!.unresolvedFields).toContain('pickupRequired');
    expect(patch!.unresolvedFields).toContain('pickupTime');
    expect(patch!.unresolvedFields).toContain('serviceWindow');
  });

  test('"at 2PM" answering pickup means 14:00; "at 99" is not a time', async () => {
    const { post, get } = await boot();
    await post('/api/turns', { conversationId: 'b1', text: 'service Saturday afternoon with pickup', nowIso: REF });
    const bad = await post('/api/turns', { conversationId: 'b1', text: 'at 99', nowIso: REF });
    expect(String(bad.question ?? '')).toContain('pickup time');
    const good = await post('/api/turns', { conversationId: 'b1', text: 'at 2PM', nowIso: REF });
    expect(good.candidates?.[0]?.pickupMin).toBe(14 * 60);
    const st = await get('/api/conversation/b1');
    expect(st.active.pickupTime).toBe('14:00');
  });
});

describe('review finding 15/B4: booking facts are never swallowed by price/complaint routing', () => {
  test('a price question carrying booking facts records the facts', async () => {
    const { post, get } = await boot();
    const r = await post('/api/turns', {
      conversationId: 'f1',
      text: 'service Sunday afternoon no pickup, what is the price?',
      nowIso: REF,
    });
    expect(String(r.question ?? '')).not.toContain('final price');
    const st = await get('/api/conversation/f1');
    expect(st.active.serviceDate).toBe('2026-11-01');
    expect(st.active.serviceWindow).toBe('afternoon');
    await post('/api/turns', { conversationId: 'f1', text: 'no', nowIso: REF });
    const st2 = await get('/api/conversation/f1');
    expect(st2.active.pickupRequired).toBe(false);
  });
});

describe('review finding B6/8: delivery and reset respect booked/opted-out state', () => {
  test('a delivered feedback job does not un-book the conversation', async () => {
    const { post, get } = await boot();
    const a = await bookFirst(post, 'fb1', 'service Saturday morning with pickup at 10', 'k-fb1');
    expect(a.c.ok).toBe(true);
    const sc = await post('/api/service-completed', { conversationId: 'fb1' });
    expect(sc.ok).toBe(true);
    // Next UTC midday after the job's due time: outside quiet hours in
    // the tick's explicit timezone, whatever the wall clock says.
    const d = new Date(Date.now() + 3600 * 1000);
    d.setUTCHours(12, 0, 0, 0);
    if (d.getTime() <= Date.now() + 3600 * 1000) d.setUTCDate(d.getUTCDate() + 1);
    await post('/api/jobs/tick', { nowMs: d.getTime(), tz: 'UTC' });
    const st = await get('/api/conversation/fb1');
    expect(st.status).toBe('booked');
    const inbox = await get('/api/inbox?conversationId=fb1');
    expect(inbox.messages.some((m: any) => String(m.text).includes('How was your service'))).toBe(true);
  });

  test('demo reset preserves opted-out conversations', async () => {
    process.env.SL_RESET_KEY = 'test-reset-key';
    const { post, get, port } = await boot();
    const a = await bookFirst(post, 'rs1', 'service Saturday morning with pickup at 10', 'k-rs1');
    expect(a.c.ok).toBe(true);
    await post('/api/optout', { conversationId: 'rs2' });
    const reset = await fetch(`http://127.0.0.1:${port}/api/admin/reset-demo`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-reset-key': 'test-reset-key' },
      body: '{}',
    }).then((r) => r.json() as Promise<any>);
    expect(reset.reset).toBe(true);
    const st = await get('/api/conversation/rs2');
    expect(st.optedOut).toBe(true);
    expect(st.status).toBe('opted_out');
  });
});

describe('review finding 13: the opening reminder schedules at most once', () => {
  test('repeat schedule calls do not stack reminders', async () => {
    const { post, get } = await boot();
    const a = await post('/api/reminders/schedule', { conversationId: 'r9', nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    const b = await post('/api/reminders/schedule', { conversationId: 'r9', nowMs: Date.parse('2026-10-27T11:00:00+05:30') });
    expect(a.ok).toBe(true);
    expect(b.duplicate).toBe(true);
    const inbox = await get('/api/inbox?conversationId=r9');
    expect(inbox.messages.length).toBeLessThanOrEqual(1);
  });
});
