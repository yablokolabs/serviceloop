import { describe, expect, test } from 'vitest';
import { applyPatch, type ConstraintState } from '../../packages/domain/src/ledger.js';

const empty: ConstraintState = { revision: 0, records: [] };

describe('constraint ledger', () => {
  test('new utterance adds proposed records and bumps revision, old values stay as history', () => {
    const s1 = applyPatch(empty, {
      turnId: 't1',
      excerpt: 'service Tuesday 9 AM with pickup',
      additions: [
        { field: 'serviceDate', value: '2026-10-27', scope: 'booking' },
        { field: 'pickupRequired', value: true, scope: 'booking' },
      ],
    });
    expect(s1.revision).toBe(1);
    const s2 = applyPatch(s1, {
      turnId: 't2',
      excerpt: 'move to Wednesday 11 AM, keep pickup',
      additions: [{ field: 'serviceDate', value: '2026-10-28', scope: 'booking' }],
      supersessions: ['serviceDate'],
    });
    expect(s2.revision).toBe(2);
    const dates = s2.records.filter((r) => r.field === 'serviceDate');
    expect(dates).toHaveLength(2);
    expect(dates.find((r) => r.value === '2026-10-27')?.status).toBe('superseded');
    expect(dates.find((r) => r.value === '2026-10-28')?.status).toBe('proposed');
    const old = dates.find((r) => r.value === '2026-10-27');
    const cur = dates.find((r) => r.value === '2026-10-28');
    expect(cur?.supersedesId).toBe(old?.id);
  });

  test('revocation marks revoked and keeps the record', () => {
    const s1 = applyPatch(empty, {
      turnId: 't1',
      excerpt: 'need pickup',
      additions: [{ field: 'pickupRequired', value: true, scope: 'booking' }],
    });
    const s2 = applyPatch(s1, { turnId: 't2', excerpt: 'no pickup actually', revocations: ['pickupRequired'] });
    expect(s2.records.filter((r) => r.field === 'pickupRequired')).toHaveLength(1);
    expect(s2.records.find((r) => r.field === 'pickupRequired')?.status).toBe('revoked');
  });

  test('status mutations carry the new revision so storage layers persist them', () => {
    const s1 = applyPatch(empty, {
      turnId: 't1',
      excerpt: 'need pickup',
      additions: [{ field: 'pickupRequired', value: true, scope: 'booking' }],
    });
    const s2 = applyPatch(s1, { turnId: 't2', excerpt: 'no pickup', revocations: ['pickupRequired'] });
    expect(s2.records.find((r) => r.field === 'pickupRequired')).toMatchObject({ status: 'revoked', revision: 2 });
  });

  test('contradictory patch with no parseable fields changes nothing and reports unresolved', () => {
    const s1 = applyPatch(empty, { turnId: 't1', excerpt: 'uhh maybe whenever', additions: [] });
    expect(s1.revision).toBe(0);
    expect(s1.records).toHaveLength(0);
  });
});
