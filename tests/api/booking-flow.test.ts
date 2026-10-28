import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer, dropsStalePickupTime, hasDateReference, pendingToClear, pendingToSet, unresolvedAfterLedger } from '../../apps/api/src/server.js';
import { applyPatch } from '../../packages/domain/src/ledger.js';

const REF = '2026-10-26T09:00:00+05:30';
const servers: { close(): void }[] = [];
afterAll(() => servers.forEach((s) => s.close()));

async function boot(dates?: string[], testMode = false) {
  const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-api-')), 'api.db');
  const srv = createServer({
    dbPath,
    workshopDate: '2026-10-31',
    workshopDates: dates,
    workshopClosedNote: 'closed Sundays',
    timezone: 'Asia/Kolkata',
    testMode,
  });
  const port = await srv.listen(0);
  servers.push(srv);
  const post = (path: string, body: unknown, headers?: Record<string, string>) =>
    fetch(`http://127.0.0.1:${port}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }).then(async (r) => ({ status: r.status, ...((await r.json()) as any) }));
  const get = (path: string) =>
    fetch(`http://127.0.0.1:${port}${path}`).then(async (r) => ({ status: r.status, ...((await r.json()) as any) }));
  return { post, get, dbPath };
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

  test('pending date ambiguity survives a date-less turn until an explicit date clears it', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c9',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    const d = await post('/api/turns', { conversationId: 'c9', text: 'actually next Saturday', nowIso: REF });
    expect(d.question ?? '').toContain('Before I check availability');
    expect(d.candidates ?? []).toHaveLength(0);
    // A later date-less fragment must not silently reuse the old date.
    const frag = await post('/api/turns', { conversationId: 'c9', text: 'morning', nowIso: REF });
    expect(frag.question ?? '').toContain('Before I check availability');
    expect(frag.candidates ?? []).toHaveLength(0);
    const stale = await post('/api/proposals', { conversationId: 'c9', candidateId: t.candidates[0].id });
    expect(stale.ok).toBe(false);
    expect(stale.error).toBe('clarification-required');
    // An explicit date resolves the pending ambiguity.
    const resolved = await post('/api/turns', { conversationId: 'c9', text: 'Saturday', nowIso: REF });
    expect(resolved.question ?? '').not.toContain('Before I check availability');
    expect((resolved.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('pending date ambiguity blocks confirming an older proposal', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c10',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const p = await post('/api/proposals', { conversationId: 'c10', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    await post('/api/turns', { conversationId: 'c10', text: 'actually next Saturday', nowIso: REF });
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k-pending',
    });
    expect(c.ok).toBe(false);
    expect(c.error).toBe('clarification-required');
    const yes = await post('/api/turns', { conversationId: 'c10', text: 'yes', nowIso: REF });
    expect(yes.question ?? '').toContain('which date');
    expect(yes.booking ?? null).toBe(null);
  });

  test('date reference detection does not match may inside maybe', () => {
    expect(hasDateReference('maybe service before 10 with pickup')).toBe(false);
    expect(hasDateReference('service in May please')).toBe(true);
    expect(hasDateReference('service in June please')).toBe(true);
    expect(hasDateReference('actually next Saturday')).toBe(true);
    expect(hasDateReference('31st Oct')).toBe(true);
  });

  test('a newly unresolved cutoff is not satisfied by an older cutoff', () => {
    const state = applyPatch(
      { revision: 0, records: [] },
      {
        turnId: 't1',
        excerpt: 'service starts before 10',
        additions: [{ field: 'serviceStartBefore', value: '10', scope: 'booking' }],
      },
    );
    const patch = { additions: [], supersessions: [], revocations: [], unresolvedFields: ['serviceStartBefore'] };
    expect(unresolvedAfterLedger(patch, state, 'before 9')).toContain('serviceStartBefore');
    expect(unresolvedAfterLedger(patch, state, 'morning')).not.toContain('serviceStartBefore');
  });

  test('pending cutoff is raised by a new unresolved cutoff and cleared by resolving it', () => {
    const raised = { additions: [], supersessions: [], revocations: [], unresolvedFields: ['serviceStartBefore'] };
    expect(pendingToSet(raised, ['serviceStartBefore'])).toEqual(['serviceStartBefore']);
    const resolved = {
      additions: [{ field: 'serviceStartBefore', value: '09', scope: 'booking' as const }],
      supersessions: ['serviceStartBefore'],
      revocations: [],
      unresolvedFields: [],
    };
    expect(pendingToClear(resolved)).toContain('serviceStartBefore');
    expect(pendingToSet(resolved, [])).toEqual([]);
    // A contradictory patch that adds a value yet still marks the field
    // unresolved never clears the pending entry.
    const ambiguous = {
      additions: [{ field: 'serviceStartBefore', value: '09', scope: 'booking' as const }],
      supersessions: ['serviceStartBefore'],
      revocations: [],
      unresolvedFields: ['serviceStartBefore'],
    };
    expect(pendingToClear(ambiguous)).not.toContain('serviceStartBefore');
    expect(pendingToSet(ambiguous, ['serviceStartBefore'])).toEqual(['serviceStartBefore']);
    const windowed = {
      additions: [{ field: 'serviceWindow', value: 'morning', scope: 'booking' as const }],
      supersessions: ['serviceWindow'],
      revocations: [],
      unresolvedFields: [],
    };
    expect(pendingToClear(windowed)).toContain('serviceStartBefore');
    const revoked = { additions: [], supersessions: [], revocations: ['serviceDate'], unresolvedFields: [] };
    expect(pendingToClear(revoked)).toContain('serviceDate');
    expect(pendingToSet(revoked, ['serviceDate'])).toEqual([]);
  });

  test('pending timeReference blocks a bare yes until the reference is resolved', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c11',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    const p = await post('/api/proposals', { conversationId: 'c11', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    // A bare ambiguous "before 9" changes no ledger revision, yet must
    // stop a later bare yes from confirming the older proposal.
    const amb = await post('/api/turns', { conversationId: 'c11', text: 'before 9', nowIso: REF });
    expect(amb.question ?? '').toContain('Before I check availability');
    expect(amb.candidates ?? []).toHaveLength(0);
    const yes = await post('/api/turns', { conversationId: 'c11', text: 'yes', nowIso: REF });
    expect(yes.question ?? '').toContain('applies to');
    expect(yes.booking ?? null).toBe(null);
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k-timeref',
    });
    expect(c.ok).toBe(false);
    expect(c.error).toBe('clarification-required');
    // Naming the service start resolves the reference.
    const resolved = await post('/api/turns', { conversationId: 'c11', text: 'service starts before 9', nowIso: REF });
    expect(resolved.question ?? '').not.toContain('Before I check availability');
    expect(resolved.unresolvedFields ?? []).not.toContain('timeReference');
  });

  test('pending timeReference raise and clear rules', () => {
    const raised = { additions: [], supersessions: [], revocations: [], unresolvedFields: ['timeReference'] };
    expect(pendingToSet(raised, ['timeReference'])).toEqual(['timeReference']);
    const byPickup = {
      additions: [{ field: 'pickupTime', value: '09:00', scope: 'booking' as const }],
      supersessions: ['pickupTime'],
      revocations: [],
      unresolvedFields: [],
    };
    expect(pendingToClear(byPickup)).toContain('timeReference');
    const stillAmbiguous = { ...byPickup, unresolvedFields: ['timeReference'] };
    expect(pendingToClear(stillAmbiguous)).not.toContain('timeReference');
  });

  test('bare time is remembered: 2pm, then pickup yes, completes without re-asking', async () => {
    const { post } = await boot();
    const d = await post('/api/turns', { conversationId: 'c12', text: 'what about Saturday?', nowIso: REF });
    expect(d.question ?? '').toContain('whether you need pickup');
    expect(d.question ?? '').not.toContain('what pickup time');
    // The bare time must be remembered, not evaporate: only pickup remains.
    const t = await post('/api/turns', { conversationId: 'c12', text: '2pm ok', nowIso: REF });
    expect(t.question ?? '').toContain('whether you need pickup');
    expect(t.question ?? '').not.toContain('what time of day');
    expect(t.question ?? '').not.toContain('what pickup time');
    // Confirming pickup applies the remembered 2pm; no time question again.
    const done = await post('/api/turns', { conversationId: 'c12', text: 'yes i need pickup', nowIso: REF });
    expect(done.question ?? '').not.toContain('Before I check availability');
    expect((done.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('"same time" resolves from the remembered time', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c13', text: 'service Saturday', nowIso: REF });
    await post('/api/turns', { conversationId: 'c13', text: '2pm ok', nowIso: REF });
    await post('/api/turns', { conversationId: 'c13', text: 'yes i need pickup', nowIso: REF });
    const res = await post('/api/turns', { conversationId: 'c13', text: 'same time ok', nowIso: REF });
    expect(res.question ?? '').not.toContain('what pickup time');
    expect(res.question ?? '').not.toContain('what time of day');
    expect((res.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('an active window satisfies a cutoff question unless a new before-time arrives', () => {
    const state = applyPatch(
      { revision: 0, records: [] },
      {
        turnId: 't1',
        excerpt: 'Saturday afternoon',
        additions: [
          { field: 'serviceDate', value: '2026-10-31', scope: 'booking' },
          { field: 'serviceWindow', value: 'afternoon', scope: 'booking' },
        ],
      },
    );
    const patch = { additions: [], supersessions: [], revocations: [], unresolvedFields: ['serviceStartBefore'] };
    expect(unresolvedAfterLedger(patch, state, 'same time ok')).not.toContain('serviceStartBefore');
    expect(unresolvedAfterLedger(patch, state, 'before 9')).toContain('serviceStartBefore');
  });

  test('pickup time is only asked once pickup is confirmed', () => {
    const noPickupYet = applyPatch(
      { revision: 0, records: [] },
      {
        turnId: 't1',
        excerpt: 'service Saturday',
        additions: [{ field: 'serviceDate', value: '2026-10-31', scope: 'booking' }],
      },
    );
    const patch = { additions: [], supersessions: [], revocations: [], unresolvedFields: ['pickupTime'] };
    expect(unresolvedAfterLedger(patch, noPickupYet, 'whenever')).not.toContain('pickupTime');
    const pickupYes = applyPatch(noPickupYet, {
      turnId: 't2',
      excerpt: 'yes i need pickup',
      additions: [{ field: 'pickupRequired', value: true, scope: 'booking' }],
    });
    expect(unresolvedAfterLedger(patch, pickupYes, 'whenever')).toContain('pickupTime');
  });

  test('a confirmed pickup time is honored exactly in candidates', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c14',
      text: 'service Saturday afternoon with pickup at 2pm',
      nowIso: REF,
    });
    expect(t.candidates?.length).toBeGreaterThan(0);
    expect(t.candidates[0].pickupMin).toBe(14 * 60);
    expect(t.candidates[0].serviceStartMin).toBe(14 * 60 + 30);
  });

  test('a cutoff phrase never becomes a remembered time', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c15', text: 'service Saturday', nowIso: REF });
    const res = await post('/api/turns', { conversationId: 'c15', text: 'before 10am with pickup', nowIso: REF });
    expect(res.question ?? '').toContain('applies to');
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('revoking pickup clears the remembered time instead of restoring it', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c16', text: 'service Saturday', nowIso: REF });
    await post('/api/turns', { conversationId: 'c16', text: '2pm ok', nowIso: REF });
    await post('/api/turns', { conversationId: 'c16', text: 'actually no pickup needed', nowIso: REF });
    const res = await post('/api/turns', { conversationId: 'c16', text: 'yes i need pickup', nowIso: REF });
    expect(res.question ?? '').toContain('what pickup time');
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('an invalid clock time is not stored or derived', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c17', text: 'service Saturday', nowIso: REF });
    await post('/api/turns', { conversationId: 'c17', text: '2:99pm ok', nowIso: REF });
    const res = await post('/api/turns', { conversationId: 'c17', text: 'yes i need pickup', nowIso: REF });
    expect(res.question ?? '').toContain('what pickup time');
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('an out-of-range pickup time is asked for, never normalized into a slot', async () => {
    const { post } = await boot();
    const res = await post('/api/turns', {
      conversationId: 'c18',
      text: 'service Saturday afternoon with pickup at 2:60pm',
      nowIso: REF,
    });
    expect(res.question ?? '').toContain('what pickup time');
    expect(res.candidates ?? []).toHaveLength(0);
  });

  test('an explicit service-start cutoff bounds the offered start', async () => {
    const { post } = await boot();
    const blocked = await post('/api/turns', {
      conversationId: 'c19',
      text: 'service starts before 10am Saturday with pickup at 10am',
      nowIso: REF,
    });
    expect(blocked.candidates ?? []).toHaveLength(0);
    const ok = await post('/api/turns', {
      conversationId: 'c20',
      text: 'service starts before 11am Saturday with pickup at 10am',
      nowIso: REF,
    });
    expect(ok.candidates?.length).toBeGreaterThan(0);
    expect(ok.candidates[0].serviceStartMin).toBeLessThan(11 * 60);
  });

  test('proposals refuse while a required pickup time is missing', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c21', text: 'service Saturday morning', nowIso: REF });
    const p = await post('/api/proposals', { conversationId: 'c21', candidateId: 'cand-2026-10-31-630-bay-1-driver-1' });
    expect(p.ok).toBe(false);
    expect(p.error).toBe('clarification-required');
    await post('/api/turns', { conversationId: 'c21', text: 'yes i need pickup', nowIso: REF });
    const p2 = await post('/api/proposals', { conversationId: 'c21', candidateId: 'cand-2026-10-31-630-bay-1-driver-1' });
    expect(p2.ok).toBe(false);
    expect(p2.error).toBe('clarification-required');
    expect(p2.unresolvedFields).toContain('pickupTime');
  });

  test('a bare affirmative answers the single outstanding pickup question', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c22', text: 'saturday 2pm', nowIso: REF });
    const yes = await post('/api/turns', { conversationId: 'c22', text: 'yup', nowIso: REF });
    expect(yes.question ?? '').not.toContain('whether you need pickup');
    expect((yes.candidates ?? []).length).toBeGreaterThan(0);
    // Not a blanket yes: with several facts missing it still asks.
    const fresh = await post('/api/turns', { conversationId: 'c23', text: 'yup', nowIso: REF });
    expect(fresh.question ?? '').toContain('whether you need pickup');
    expect(fresh.candidates ?? []).toHaveLength(0);
  });

  test('a bare negative answers the pickup question too', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c24', text: 'saturday 2pm', nowIso: REF });
    const no = await post('/api/turns', { conversationId: 'c24', text: 'no', nowIso: REF });
    expect(no.question ?? '').not.toContain('whether you need pickup');
    expect((no.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('one question is answered per turn: pickup first, then the demo-day offer', async () => {
    const { post } = await boot();
    await post('/api/turns', { conversationId: 'c25', text: 'tomorrow 2pm', nowIso: REF });
    const yup = await post('/api/turns', { conversationId: 'c25', text: 'yup', nowIso: REF });
    // Pickup answered; the demo-day offer is presented, not skipped.
    expect(yup.question ?? '').toContain('only runs 2026-10-31');
    expect(yup.candidates ?? []).toHaveLength(0);
    const yes = await post('/api/turns', { conversationId: 'c25', text: 'yes', nowIso: REF });
    expect((yes.candidates ?? []).length).toBeGreaterThan(0);
    const deny = await post('/api/turns', { conversationId: 'c26', text: 'tomorrow 2pm', nowIso: REF });
    expect(deny.candidates ?? []).toHaveLength(0);
    await post('/api/turns', { conversationId: 'c26', text: 'yup', nowIso: REF });
    const no = await post('/api/turns', { conversationId: 'c26', text: 'no', nowIso: REF });
    expect(no.question ?? '').toContain('only runs 2026-10-31');
    expect(no.question ?? '').not.toContain('Want that day instead?');
  });

  test('turning pickup off also drops a stale pickup time', () => {
    const noPickup = {
      additions: [{ field: 'pickupRequired', value: false, scope: 'booking' as const }],
      supersessions: ['pickupRequired'],
      revocations: [],
      unresolvedFields: [],
    };
    expect(dropsStalePickupTime(noPickup)).toBe(true);
    expect(dropsStalePickupTime({ ...noPickup, revocations: ['pickupTime'] })).toBe(false);
    const withPickup = {
      additions: [{ field: 'pickupRequired', value: true, scope: 'booking' as const }],
      supersessions: ['pickupRequired'],
      revocations: [],
      unresolvedFields: [],
    };
    expect(dropsStalePickupTime(withPickup)).toBe(false);
  });

  test('a November day books end to end when open', async () => {
    const { post } = await boot(['2026-10-31', '2026-11-02']);
    const t = await post('/api/turns', {
      conversationId: 'c27',
      text: 'service Monday afternoon with pickup at 2pm',
      nowIso: REF,
    });
    expect((t.candidates ?? []).length).toBeGreaterThan(0);
    const p = await post('/api/proposals', { conversationId: 'c27', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    const c = await post('/api/confirm', {
      proposalId: p.proposalId,
      approvalToken: p.approvalToken,
      idempotencyKey: 'k-nov2',
    });
    expect(c.ok).toBe(true);
    expect(c.bookingId).toBeGreaterThan(0);
  });

  test('a closed Sunday offers the next open day instead', async () => {
    const { post } = await boot(['2026-10-31', '2026-11-02']);
    const t = await post('/api/turns', {
      conversationId: 'c28',
      text: 'service Sunday morning with pickup at 10',
      nowIso: REF,
    });
    expect(t.question ?? '').toContain('Want 2026-11-02 instead?');
    const yes = await post('/api/turns', { conversationId: 'c28', text: 'yes', nowIso: REF });
    expect((yes.candidates ?? []).length).toBeGreaterThan(0);
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

  test('a post-range date offers no wrap-around alternative; yes does not jump back', async () => {
    const { post } = await boot(['2026-10-31', '2026-11-02']);
    const t = await post('/api/turns', {
      conversationId: 'c-post',
      text: 'service Saturday morning with pickup at 10',
      nowIso: '2026-12-05T09:00:00+05:30',
    });
    expect(t.candidates ?? null).toBe(null);
    expect(t.question ?? '').toContain('only runs');
    expect(t.question ?? '').not.toContain('instead');
    const yes = await post('/api/turns', { conversationId: 'c-post', text: 'yes', nowIso: '2026-12-05T09:00:00+05:30' });
    expect(yes.candidates ?? null).toBe(null);
    expect(yes.question ?? '').not.toContain('instead');
  });

  test('an empty open-day list rejects at startup', () => {
    const dbPath = join(mkdtempSync(join(tmpdir(), 'sl-api-')), 'api.db');
    expect(() =>
      createServer({ dbPath, workshopDate: '2026-10-31', workshopDates: [], timezone: 'Asia/Kolkata' }),
    ).toThrow(/open workshop days/);
  });

  test('a closed bay applies to November dates too', async () => {
    const { post } = await boot(['2026-10-31', '2026-11-02'], true);
    await post('/api/workshop/close-bay', {});
    const t = await post('/api/turns', {
      conversationId: 'c-close',
      text: 'service Monday afternoon with pickup at 2pm',
      nowIso: REF,
    });
    expect(t.candidates ?? []).toEqual([]);
    expect(t.question ?? '').toContain('No slot fits');
  });

  test('a past service date asks for a new date instead of checking availability', async () => {
    const { post } = await boot();
    await post('/api/turns', {
      conversationId: 'c-past',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const t = await post('/api/turns', {
      conversationId: 'c-past',
      text: 'still waiting on the service slot',
      nowIso: '2026-11-05T09:00:00+05:30',
    });
    expect(t.candidates ?? null).toBe(null);
    expect(t.question ?? '').toContain('is in the past');
  });

  test('a proposal for a past service date is rejected against the same clock', async () => {
    const { post } = await boot();
    await post('/api/turns', {
      conversationId: 'c-pastp',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    await post('/api/turns', {
      conversationId: 'c-pastp',
      text: 'still waiting on the service slot',
      nowIso: '2026-11-05T09:00:00+05:30',
    });
    const p = await post('/api/proposals', { conversationId: 'c-pastp', candidateId: 'never-exists' });
    expect(p.status).toBe(409);
    expect(p.error).toBe('clarification-required');
    expect(p.unresolvedFields).toContain('serviceDate');
  });

  test('confirm revalidates the proposal date when the clock advanced past it', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c-stale',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    const p = await post('/api/proposals', { conversationId: 'c-stale', candidateId: t.candidates[0].id });
    expect(p.approvalToken.length).toBeGreaterThan(0);
    // Neutral turn: ledger untouched, simulated clock moves past Oct 31.
    await post('/api/turns', {
      conversationId: 'c-stale',
      text: 'still waiting on the service slot',
      nowIso: '2026-11-05T09:00:00+05:30',
    });
    const c = await post('/api/confirm', { proposalId: p.proposalId, approvalToken: p.approvalToken, idempotencyKey: 'k-stale' });
    expect(c.status).toBe(409);
    expect(c.error).toBe('clarification-required');
    expect(c.bookingId ?? null).toBe(null);
  });

  test('bare yes cannot confirm a proposal the clock has moved past', async () => {
    const { post } = await boot();
    const t = await post('/api/turns', {
      conversationId: 'c-staley',
      text: 'service Saturday morning with pickup at 10',
      nowIso: REF,
    });
    await post('/api/proposals', { conversationId: 'c-staley', candidateId: t.candidates[0].id });
    const y = await post('/api/turns', { conversationId: 'c-staley', text: 'yes', nowIso: '2026-11-05T09:00:00+05:30' });
    expect(y.status).toBe(409);
    expect(y.error).toBe('clarification-required');
    expect(y.booking ?? null).toBe(null);
  });

  test('a proposal with no reference date is unresolved until a turn sets the clock', async () => {
    const { post, dbPath } = await boot();
    // Pre-migration row: ledger facts present, reference_date NULL.
    const raw = new Database(dbPath);
    raw.prepare('INSERT INTO conversations (id, created_at) VALUES (?, ?)').run('c-null', Date.now());
    const seeded = applyPatch(
      { revision: 0, records: [] },
      {
        turnId: 'seed',
        excerpt: 'seeded pre-migration ledger',
        additions: [
          { field: 'serviceDate', value: '2026-10-31', scope: 'booking' },
          { field: 'serviceWindow', value: 'morning', scope: 'booking' },
          { field: 'pickupRequired', value: false, scope: 'booking' },
        ],
      },
    );
    for (const r of seeded.records) {
      raw.prepare('INSERT OR REPLACE INTO ledger_entries (record_id, convo, record_json) VALUES (?, ?, ?)').run(r.id, 'c-null', JSON.stringify(r));
    }
    raw.close();
    const p = await post('/api/proposals', { conversationId: 'c-null', candidateId: 'whatever' });
    expect(p.status).toBe(409);
    expect(p.error).toBe('clarification-required');
    // Any turn sets the clock; the facts themselves were never the problem.
    const t = await post('/api/turns', {
      conversationId: 'c-null',
      text: 'service Saturday morning',
      nowIso: REF,
    });
    expect((t.candidates ?? []).length).toBeGreaterThan(0);
  });

  test('demo reset is key-gated, clears bookings, preserves negotiating conversations', async () => {
    const saved = process.env.SL_RESET_KEY;
    delete process.env.SL_RESET_KEY;
    try {
      const { post } = await boot();
      // Convo A books Oct 31 outright; convo B is mid-negotiation.
      const ta = await post('/api/turns', {
        conversationId: 'rst-a',
        text: 'service Saturday morning with pickup at 10',
        nowIso: REF,
      });
      const pa = await post('/api/proposals', { conversationId: 'rst-a', candidateId: ta.candidates[0].id });
      const ca = await post('/api/confirm', { proposalId: pa.proposalId, approvalToken: pa.approvalToken, idempotencyKey: 'k-rst-a' });
      expect(ca.ok).toBe(true);
      await post('/api/turns', { conversationId: 'rst-b', text: 'car service Saturday please', nowIso: REF });
      // No key configured: the endpoint does not exist.
      const off = await post('/api/admin/reset-demo', {}, { 'x-reset-key': 'anything' });
      expect(off.status).toBe(404);
      process.env.SL_RESET_KEY = 'reset-secret';
      const noKey = await post('/api/admin/reset-demo', {});
      expect(noKey.status).toBe(404);
      const wrongKey = await post('/api/admin/reset-demo', {}, { 'x-reset-key': 'nope' });
      expect(wrongKey.status).toBe(404);
      // Same string length as the key but more bytes: still a uniform 404,
      // never a 500 from a byte-length mismatch in the comparison.
      const unicodeKey = await post('/api/admin/reset-demo', {}, { 'x-reset-key': 'ü'.repeat(12) });
      expect(unicodeKey.status).toBe(404);
      const done = await post('/api/admin/reset-demo', {}, { 'x-reset-key': 'reset-secret' });
      expect(done.status).toBe(200);
      expect(done.reset).toBe(true);
      expect(done.bookingsCleared).toBe(1);
      // The booked slot is free again for a fresh conversation.
      const tc = await post('/api/turns', {
        conversationId: 'rst-c',
        text: 'service Saturday morning with pickup at 10',
        nowIso: REF,
      });
      expect((tc.candidates ?? []).length).toBe(1);
      // B kept its state: it continues to candidates without re-asking the date.
      const tb = await post('/api/turns', { conversationId: 'rst-b', text: 'morning with pickup at 11', nowIso: REF });
      expect(tb.unresolvedFields ?? []).not.toContain('serviceDate');
      // Nothing left to clear: a second reset is a no-op.
      const again = await post('/api/admin/reset-demo', {}, { 'x-reset-key': 'reset-secret' });
      expect(again.reset).toBe(false);
    } finally {
      if (saved === undefined) delete process.env.SL_RESET_KEY;
      else process.env.SL_RESET_KEY = saved;
    }
  });
});
