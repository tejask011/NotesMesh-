/**
 * Index helpers for keyboard navigation in the command palette.
 *
 * The palette keeps one flat list across notes, plugin commands and core
 * actions, so the active index only needs to move and stay within bounds.
 */

export function moveActiveIndex(current: number, length: number, delta: number): number {
  if (length <= 0) return -1;

  if (current < 0 || current >= length) {
    return delta >= 0 ? 0 : length - 1;
  }

  return ((current + delta) % length + length) % length;
}

export function clampActiveIndex(current: number, length: number): number {
  if (length <= 0) return -1;
  if (current < 0) return 0;
  return Math.min(current, length - 1);
}
