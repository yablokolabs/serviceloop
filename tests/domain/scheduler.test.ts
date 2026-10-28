import { describe, expect, test } from 'vitest';
import { findSlots, type SlotRequest, type WorkshopConfig } from '../../packages/domain/src/solver.js';

// Seeded fixture from PROJECT_BUILD.md section 5:
// free bay at 09:00, pickup driver only 10:00 onward, service follows pickup plus travel buffer.
const workshop: WorkshopConfig = {
  timezone: 'Asia/Kolkata',
  date: '2026-10-31',
  openMin: 9 * 60,
  closeMin: 17 * 60,
  serviceMins: 60,
  travelMins: 30,
  bays: [{ id: 'bay-1', freeFromMin: 9 * 60, freeToMin: 17 * 60 }],
  drivers: [{ id: 'driver-1', freeFromMin: 10 * 60, freeToMin: 17 * 60 }],
};

describe('coupled bay plus pickup solver', () => {
  test('service before 10 with pickup is impossible and returns labeled compromises', () => {
    const req: SlotRequest = { serviceStartBeforeMin: 10 * 60, pickupRequired: true };
    const out = findSlots(workshop, req);
    expect(out.candidates).toHaveLength(0);
    const reasons = out.reasons.join(' ');
    expect(reasons).toMatch(/bay/i);
    expect(reasons).toMatch(/driver/i);
    expect(out.compromises.length).toBeGreaterThan(0);
    for (const c of out.compromises) expect(c.violatedPreference.length).toBeGreaterThan(0);
  });

  test('feasible morning request puts service after pickup plus travel', () => {
    const req: SlotRequest = { serviceStartBeforeMin: 12 * 60, pickupRequired: true };
    const out = findSlots(workshop, req);
    expect(out.candidates.length).toBeGreaterThan(0);
    const c = out.candidates[0];
    expect(c.pickupMin).toBe(10 * 60);
    expect(c.serviceStartMin).toBeGreaterThanOrEqual(c.pickupMin! + workshop.travelMins);
  });

  test('a confirmed pickup time is exact, not the driver earliest', () => {
    const out = findSlots(workshop, { pickupRequired: true, pickupAtMin: 14 * 60 });
    expect(out.candidates).toHaveLength(1);
    expect(out.candidates[0].pickupMin).toBe(14 * 60);
    expect(out.candidates[0].serviceStartMin).toBe(14 * 60 + 30);
  });

  test('an infeasible confirmed pickup time yields no candidate', () => {
    const out = findSlots(workshop, { pickupRequired: true, pickupAtMin: 16 * 60 + 45 });
    expect(out.candidates).toHaveLength(0);
  });

  test('an afternoon window bounds the service start from below', () => {
    const out = findSlots(workshop, {
      pickupRequired: true,
      pickupAtMin: 10 * 60,
      serviceStartAtOrAfterMin: 12 * 60,
    });
    expect(out.candidates).toHaveLength(0);
    const ok = findSlots(workshop, {
      pickupRequired: false,
      serviceStartAtOrAfterMin: 12 * 60,
      serviceStartBeforeMin: 17 * 60,
    });
    expect(ok.candidates.length).toBeGreaterThan(0);
    expect(ok.candidates[0].serviceStartMin).toBeGreaterThanOrEqual(12 * 60);
  });

  test('pickup time and service start never share a value on a pickup candidate', () => {
    const out = findSlots(workshop, { serviceStartBeforeMin: 12 * 60, pickupRequired: true });
    for (const c of out.candidates) {
      if (c.pickupMin !== undefined) expect(c.serviceStartMin).not.toBe(c.pickupMin);
    }
  });

  test('a closed bay yields no candidates with a reason instead of crashing', () => {
    const closed = { ...workshop, bays: [] };
    const out = findSlots(closed, { pickupRequired: true, pickupAtMin: 14 * 60 });
    expect(out.candidates).toEqual([]);
    expect(out.reasons.join(' ')).toMatch(/no service bay is available/);
    const plain = findSlots(closed, { pickupRequired: false });
    expect(plain.candidates).toEqual([]);
  });
});
