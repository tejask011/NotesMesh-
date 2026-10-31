const titleKey = (title: string) => title.toLowerCase().trim();

/**
 * Wikilinks resolve by title, so a duplicate would make [[Title]] ambiguous.
 * Returns `title` if free, otherwise "title (2)", "title (3)", ...
 */
export function uniqueTitle(title: string, existingTitles: Iterable<string>): string {
  const taken = new Set(Array.from(existingTitles, titleKey));
  if (!taken.has(titleKey(title))) return title;
  let suffix = 2;
  while (taken.has(titleKey(`${title} (${suffix})`))) suffix += 1;
  return `${title} (${suffix})`;
}
