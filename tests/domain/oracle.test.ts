import { describe, expect, test } from 'vitest';
import {
  isMorning,
  resolveWeekday,
  splitTimeReference,
} from '../../packages/domain/src/dates.js';

// Oracle rules fixed from evidence/INITIAL_MODEL_SMOKE_TEST_RESULTS.md (both FAILs preserved there).
// Workshop timezone defaults to Asia/Kolkata but stays configurable; storage is UTC.

describe('weekday resolution', () => {
  test('Saturday after Monday 2026-10-26 resolves to 2026-10-31', () => {
    const d = resolveWeekday('Saturday', '2026-10-26T09:00:00', 'Asia/Kolkata');
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.date).toBe('2026-10-31');
  });

  test('Wednesday after Monday 2026-10-26 resolves to 2026-10-28', () => {
    const d = resolveWeekday('Wednesday', '2026-10-26T09:00:00', 'America/Los_Angeles');
    expect(d.ok).toBe(true);
    if (d.ok) expect(d.date).toBe('2026-10-28');
  });

  test('"next Saturday" without a reference Saturday stays unresolved', () => {
    const d = resolveWeekday('next Saturday', '2026-10-26T09:00:00', 'Asia/Kolkata');
    expect(d.ok).toBe(false);
  });
});

describe('morning means morning', () => {
  test('11 AM counts as morning, so moving an 11 AM service to "morning" is not a conflict', () => {
    expect(isMorning('11:00')).toBe(true);
  });

  test('08:30 pickup stays a pickup time and never becomes the service time', () => {
    const r = splitTimeReference('pickup at 08:30');
    expect(r.event).toBe('pickup');
    expect(r.time).toBe('08:30');
  });

  test('"before ten" without an event reference stays ambiguous across pickup arrival, service start, completion', () => {
    const r = splitTimeReference('before ten');
    expect(r.event).toBe('unknown');
    expect(r.candidates).toContain('pickup-arrival');
    expect(r.candidates).toContain('service-start');
    expect(r.candidates).toContain('service-completion');
  });
});
