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

  test('pickup time and service start never share a value on a pickup candidate', () => {
    const out = findSlots(workshop, { serviceStartBeforeMin: 12 * 60, pickupRequired: true });
    for (const c of out.candidates) {
      if (c.pickupMin !== undefined) expect(c.serviceStartMin).not.toBe(c.pickupMin);
    }
  });
});
