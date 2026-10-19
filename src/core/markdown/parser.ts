import { Marked, Tokens } from 'marked';
import { transformOutsideFences } from './codeRegions';

interface WikilinkToken {
  type: 'wikilink';
  raw: string;
  target: string;
  alias: string;
}

export function createMarkedInstance(existingTitles: Set<string>) {
  const m = new Marked({
    gfm: true,
    breaks: true,
  });

  m.use({
    extensions: [
      {
        name: 'wikilink',
        level: 'inline',
        start(src: string) {
          return src.indexOf('[[');
        },
        tokenizer(src: string): WikilinkToken | undefined {
          const rule = /^\[\[([^[\]]+?)\]\]/;
          const match = rule.exec(src);
          if (match) {
            const rawInner = match[1].trim();
            const parts = rawInner.split('|');
            const target = parts[0].trim();
            const alias = parts[1] ? parts[1].trim() : target;
            return {
              type: 'wikilink',
              raw: match[0],
              target,
              alias,
            };
          }
        },
        renderer(token: Tokens.Generic) {
          const wikilink = token as unknown as WikilinkToken;
          const target = wikilink.target || '';
          const alias = wikilink.alias || target;
          const exists = existingTitles.has(target.toLowerCase());

          const statusClass = exists
            ? 'text-primary hover:underline bg-primary/10 border-primary/30'
            : 'text-amber-500 hover:underline bg-amber-500/10 border-dashed border-amber-500/40';

          const escapedTarget = escapeHtml(target);
          const escapedAlias = escapeHtml(alias);

          return `<span class="inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-semibold cursor-pointer border wikilink-pill ${statusClass}" data-wikilink="${escapedTarget}">[[${escapedAlias}]]</span>`;
        },
      },
    ],
  });

  return m;
}

export function renderMarkdown(markdown: string, existingTitles: Set<string>): string {
  if (!markdown) return '';
  // Normalize headings typed without spaces like "##hello" -> "## hello".
  // Fenced code lines are skipped so shebangs and shell comments stay intact.
  const normalized = transformOutsideFences(markdown, line =>
    line.replace(/^(#{1,6})([^\s#])/, '$1 $2')
  );
  const instance = createMarkedInstance(existingTitles);
  return instance.parse(normalized) as string;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
