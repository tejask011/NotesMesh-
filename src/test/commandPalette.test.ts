import { describe, it, expect } from 'vitest';
import { clampActiveIndex, moveActiveIndex } from '../core/commandPalette/navigation';

describe('command palette navigation', () => {
  it('moves down through the list', () => {
    expect(moveActiveIndex(0, 3, 1)).toBe(1);
    expect(moveActiveIndex(1, 3, 1)).toBe(2);
  });

  it('wraps from the last item to the first when moving down', () => {
    expect(moveActiveIndex(2, 3, 1)).toBe(0);
  });

  it('moves up through the list', () => {
    expect(moveActiveIndex(2, 3, -1)).toBe(1);
  });

  it('wraps from the first item to the last when moving up', () => {
    expect(moveActiveIndex(0, 3, -1)).toBe(2);
  });

  it('stays on the only item in a single item list', () => {
    expect(moveActiveIndex(0, 1, 1)).toBe(0);
    expect(moveActiveIndex(0, 1, -1)).toBe(0);
  });

  it('returns -1 for an empty list', () => {
    expect(moveActiveIndex(0, 0, 1)).toBe(-1);
    expect(clampActiveIndex(0, 0)).toBe(-1);
  });

  it('recovers from an out-of-range index', () => {
    expect(moveActiveIndex(-1, 3, 1)).toBe(0);
    expect(moveActiveIndex(3, 3, 1)).toBe(0);
    expect(moveActiveIndex(9, 3, -1)).toBe(2);
    expect(moveActiveIndex(-1, 3, -1)).toBe(2);
  });

  it('clamps an index after the result list shrinks', () => {
    expect(clampActiveIndex(4, 2)).toBe(1);
    expect(clampActiveIndex(-3, 2)).toBe(0);
    expect(clampActiveIndex(1, 2)).toBe(1);
  });
});
