import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { cancelBooking, confirmBooking, holdSlot, openStore } from '../../packages/domain/src/store.js';

function freshStore() {
  return openStore(join(mkdtempSync(join(tmpdir(), 'sl-')), 'bookings.db'));
}

const slot = { slotId: 'bay-1@2026-10-31T10:30', serviceStartMin: 630, pickupMin: 600 };

describe('atomic booking against real storage', () => {
  test('journal mode is WAL by default, DELETE on exact opt-in', () => {
    const saved = process.env.SQLITE_JOURNAL_MODE;
    delete process.env.SQLITE_JOURNAL_MODE;
    try {
      const def = openStore(join(mkdtempSync(join(tmpdir(), 'sl-')), 'j1.db'));
      const rawDef = (def as unknown as { raw: { pragma(s: string, o: unknown): unknown } }).raw;
      expect(rawDef.pragma('journal_mode', { simple: true })).toBe('wal');
      process.env.SQLITE_JOURNAL_MODE = 'delete';
      const del = openStore(join(mkdtempSync(join(tmpdir(), 'sl-')), 'j2.db'));
      const rawDel = (del as unknown as { raw: { pragma(s: string, o: unknown): unknown } }).raw;
      expect(rawDel.pragma('journal_mode', { simple: true })).toBe('delete');
    } finally {
      if (saved === undefined) delete process.env.SQLITE_JOURNAL_MODE;
      else process.env.SQLITE_JOURNAL_MODE = saved;
    }
  });
  test('same idempotency key twice yields one booking with one id', () => {
    const store = freshStore();
    const hold = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    const first = confirmBooking(store, {
      holdToken: hold.holdToken,
      approvalToken: 'appr-1',
      idempotencyKey: 'idem-1',
      constraintsRev: 3,
      cancelToken: 'ctok',
    });
    const again = confirmBooking(store, {
      holdToken: hold.holdToken,
      approvalToken: 'appr-1',
      idempotencyKey: 'idem-1',
      constraintsRev: 3,
      cancelToken: 'ctok',
    });
    expect(first.ok && again.ok && first.bookingId).toBe(again.ok && again.bookingId);
    expect(store.bookingCount()).toBe(1);
    store.close();
  });

  test('two holds racing one slot yield one winner', () => {
    const store = freshStore();
    const a = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    const second = () => holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    expect(a.holdToken.length).toBeGreaterThan(0);
    expect(second).toThrow();
    store.close();
  });

  test('knowing a booking id alone cannot cancel; the cancel token is required', () => {
    const store = freshStore();
    const hold = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    const res = confirmBooking(store, {
      holdToken: hold.holdToken,
      approvalToken: 'appr-1',
      idempotencyKey: 'idem-x',
      constraintsRev: 3,
      cancelToken: 'secret-x',
    });
    expect(res.ok).toBe(true);
    const id = res.ok ? res.bookingId : -1;
    expect(cancelBooking(store, id, 'wrong-token').ok).toBe(false);
    expect(store.bookingCount()).toBe(1);
    expect(cancelBooking(store, id, 'secret-x').ok).toBe(true);
    expect(store.bookingCount()).toBe(0);
    store.close();
  });

  test('an expired hold frees the slot for a fresh hold', () => {
    const store = freshStore();
    const dead = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: -1 });
    const live = holdSlot(store, { ...slot, proposalRev: 4, holdSecs: 300 });
    expect(live.holdToken).not.toBe(dead.holdToken);
    store.close();
  });

  test('confirm consumes the hold; the slot can be re-held but not double-booked', () => {
    const store = freshStore();
    const h1 = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    const r1 = confirmBooking(store, {
      holdToken: h1.holdToken, approvalToken: 'appr-1', idempotencyKey: 'idem-a',
      constraintsRev: 3, cancelToken: 'ctok',
    });
    expect(r1.ok).toBe(true);
    const h2 = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    expect(h2.holdToken.length).toBeGreaterThan(0);
    const r2 = confirmBooking(store, {
      holdToken: h2.holdToken, approvalToken: 'appr-2', idempotencyKey: 'idem-b',
      constraintsRev: 3, cancelToken: 'ctok',
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('slot-taken');
    expect(store.bookingCount()).toBe(1);
    store.close();
  });

  test('expired hold confirms nothing and forces fresh approval', () => {
    const store = freshStore();
    const hold = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: -1 });
    const res = confirmBooking(store, {
      holdToken: hold.holdToken,
      approvalToken: 'appr-1',
      idempotencyKey: 'idem-9',
      constraintsRev: 3,
      cancelToken: 'ctok',
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe('hold-expired');
    expect(store.bookingCount()).toBe(0);
    store.close();
  });

  test('an idempotency key replayed against a different hold is a conflict', () => {
    const store = freshStore();
    const h1 = holdSlot(store, { ...slot, proposalRev: 3, holdSecs: 300 });
    const r1 = confirmBooking(store, {
      holdToken: h1.holdToken, approvalToken: 'appr-1', idempotencyKey: 'idem-shared',
      constraintsRev: 3, cancelToken: 'ctok-1',
    });
    expect(r1.ok).toBe(true);
    const other = { slotId: 'bay-1@2026-10-31T840', serviceStartMin: 840 };
    const h2 = holdSlot(store, { ...other, proposalRev: 3, holdSecs: 300 });
    const r2 = confirmBooking(store, {
      holdToken: h2.holdToken, approvalToken: 'appr-2', idempotencyKey: 'idem-shared',
      constraintsRev: 3, cancelToken: 'ctok-2',
    });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('idempotency-key-reused');
    expect(store.bookingCount()).toBe(1);
    store.close();
  });

  test('different start times overlapping one bay cannot both confirm', () => {
    const store = freshStore();
    const iv = (startMin: number, pickupMin: number) => ({
      day: '2026-10-31',
      bayId: 'bay-1',
      driverId: 'driver-1',
      bayFrom: startMin,
      bayTo: startMin + 60,
      drvFrom: pickupMin,
      drvTo: pickupMin + 30,
    });
    const h1 = holdSlot(store, {
      slotId: 'bay-1@2026-10-31T630', serviceStartMin: 630, pickupMin: 600,
      proposalRev: 3, holdSecs: 300, interval: iv(630, 600),
    });
    const r1 = confirmBooking(store, {
      holdToken: h1.holdToken, approvalToken: 'appr-1', idempotencyKey: 'idem-ov1',
      constraintsRev: 3, cancelToken: 'ctok-1',
    });
    expect(r1.ok).toBe(true);
    // Second hold overlaps the first booking's bay and driver intervals.
    expect(() =>
      holdSlot(store, {
        slotId: 'bay-1@2026-10-31T645', serviceStartMin: 645, pickupMin: 615,
        proposalRev: 3, holdSecs: 300, interval: iv(645, 615),
      }),
    ).toThrow('slot-overlap');
    store.close();
  });
});
