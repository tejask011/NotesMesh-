import { describe, it, expect } from 'vitest';
import { toLocalDateKey } from '../core/date/localDate';

describe('toLocalDateKey', () => {
  it('formats a local date as YYYY-MM-DD', () => {
    expect(toLocalDateKey(new Date(2026, 0, 1))).toBe('2026-01-01');
  });

  it('zero pads single digit months and days', () => {
    expect(toLocalDateKey(new Date(2026, 8, 5))).toBe('2026-09-05');
  });

  it('keeps the local day at the end of the year', () => {
    expect(toLocalDateKey(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
  });

  it('keeps the local day at the start of the year', () => {
    expect(toLocalDateKey(new Date(2026, 0, 1, 0, 0, 0))).toBe('2026-01-01');
  });

  it('handles a leap day', () => {
    expect(toLocalDateKey(new Date(2028, 1, 29))).toBe('2028-02-29');
  });

  it('reads the local calendar fields instead of the UTC date', () => {
    const skewed = {
      getFullYear: () => 2026,
      getMonth: () => 11,
      getDate: () => 31,
      toISOString: () => '2027-01-01T01:00:00.000Z',
    } as unknown as Date;

    expect(toLocalDateKey(skewed)).toBe('2026-12-31');
  });

  it('defaults to the current local date', () => {
    const now = new Date();
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-');

    expect(toLocalDateKey()).toBe(expected);
  });
});
