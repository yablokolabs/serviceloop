import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import { createServer, hasDateReference, pendingToClear, pendingToSet, unresolvedAfterLedger } from '../../apps/api/src/server.js';
import { applyPatch } from '../../packages/domain/src/ledger.js';

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
