/**
 * Local calendar helpers.
 *
 * `Date.prototype.toISOString` is always UTC, which is the wrong source for
 * daily notes, template dates and backup filenames. A day boundary belongs to
 * the user's calendar, so the local getters are the only correct input.
 */

export function toLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}
