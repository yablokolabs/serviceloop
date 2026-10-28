import { describe, expect, test } from 'vitest';
import { openDaysBetween } from '../../packages/domain/src/dates.js';

describe('open days', () => {
  test('spans the range and skips Sundays by default', () => {
    // 2026-10-31 is a Saturday, 2026-11-01 a Sunday, 2026-11-02 a Monday.
    expect(openDaysBetween('2026-10-31', '2026-11-02')).toEqual(['2026-10-31', '2026-11-02']);
    expect(openDaysBetween('2026-10-31', '2026-11-30')).toHaveLength(26);
    expect(openDaysBetween('2026-10-31', '2026-11-30')).not.toContain('2026-11-01');
    expect(openDaysBetween('2026-11-01', '2026-11-01', false)).toEqual(['2026-11-01']);
  });
});
