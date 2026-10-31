import DOMPurify from 'dompurify';
import { Marked, Tokens } from 'marked';

interface WikilinkToken {
  type: 'wikilink';
  raw: string;
  target: string;
  alias: string;
}

interface MathToken {
  type: 'inlineMath' | 'blockMath';
  raw: string;
  tex: string;
}

/**
 * Math and Mermaid render to placeholders holding their source as text. The
 * preview upgrades those after the sanitizer runs, loading the (large)
 * renderers only if a note actually uses them. See features/notes/richContent.ts.
 */
export const INLINE_MATH_CLASS = 'math-inline';
export const BLOCK_MATH_CLASS = 'math-block';
export const MERMAID_CLASS = 'mermaid-block';

export function createMarkedInstance(existingTitles: Set<string>) {
  const m = new Marked({
    gfm: true,
    breaks: true,
  });

  m.use({
    renderer: {
      code(token: Tokens.Code) {
        if (token.lang?.trim().toLowerCase() === 'mermaid') {
          return `<pre class="${MERMAID_CLASS}"><code>${escapeHtml(token.text)}</code></pre>\n`;
        }
        return false;
      },
    },
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
      {
        name: 'blockMath',
        level: 'block',
        start(src: string) {
          return src.indexOf('$$');
        },
        tokenizer(src: string): MathToken | undefined {
          const match = /^\$\$([\s\S]+?)\$\$[ \t]*(?:\n|$)/.exec(src);
          if (match) return { type: 'blockMath', raw: match[0], tex: match[1].trim() };
        },
        renderer(token: Tokens.Generic) {
          return `<div class="${BLOCK_MATH_CLASS}">${escapeHtml((token as unknown as MathToken).tex)}</div>\n`;
        },
      },
      {
        name: 'inlineMath',
        level: 'inline',
        start(src: string) {
          return src.indexOf('$');
        },
        tokenizer(src: string): MathToken | undefined {
          // Same rule as Pandoc, so prices stay text: no space inside the
          // delimiters, and the closing $ can't be followed by a digit.
          const match = /^\$(?!\s)((?:\\.|[^$\\\n])*?[^\s$\\])\$(?!\d)/.exec(src);
          if (match) return { type: 'inlineMath', raw: match[0], tex: match[1] };
        },
        renderer(token: Tokens.Generic) {
          return `<span class="${INLINE_MATH_CLASS}">${escapeHtml((token as unknown as MathToken).tex)}</span>`;
        },
      },
    ],
  });

  return m;
}

/**
 * "##hello" is rendered as a heading for convenience, but only with two or more
 * hashes ("#hello" is a tag) and never inside a code fence ("#include").
 */
function normalizeHeadings(markdown: string): string {
  let fence: string | null = null;
  return markdown
    .split('\n')
    .map(line => {
      const marker = /^ {0,3}(`{3,}|~{3,})/.exec(line)?.[1];
      if (marker) {
        if (fence === null) fence = marker[0];
        else if (marker[0] === fence) fence = null;
        return line;
      }
      return fence === null ? line.replace(/^(#{2,6})([^\s#])/, '$1 $2') : line;
    })
    .join('\n');
}

let hooksInstalled = false;

function sanitizeHtml(html: string): string {
  if (!hooksInstalled) {
    // Links in notes open in a new tab rather than navigating away from the workspace.
    DOMPurify.addHook('afterSanitizeAttributes', node => {
      if (node.tagName === 'A' && node.getAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
    hooksInstalled = true;
  }
  return DOMPurify.sanitize(html, { ADD_ATTR: ['target'] });
}

export function renderMarkdown(markdown: string, existingTitles: Set<string>): string {
  if (!markdown) return '';
  const instance = createMarkedInstance(existingTitles);
  // Notes can come from imported files, so rendered HTML is treated as untrusted.
  return sanitizeHtml(instance.parse(normalizeHeadings(markdown)) as string);
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
