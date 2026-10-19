import { Marked, Tokens } from 'marked';

interface WikilinkToken {
  type: 'wikilink';
  raw: string;
  target: string;
  alias: string;
}

const ALLOWED_URL_SCHEMES = ['http:', 'https:', 'mailto:', 'tel:'];

/**
 * Strip a URL down to a safe value before it is written into an attribute.
 * Relative paths, anchors and query strings are kept as is. Absolute URLs are
 * only allowed for the schemes above, everything else (javascript, data,
 * vbscript, file and custom schemes) is rejected.
 */
export function sanitizeUrl(rawUrl: string): string {
  if (!rawUrl) return '';
  const value = rawUrl.trim();
  if (!value) return '';

  // Browsers ignore control characters and whitespace inside a scheme, and
  // entities are decoded when the attribute is applied, so both tricks have to
  // be normalised before the scheme check.
  const decoded = stripControlAndWhitespace(decodeNumericEntities(value));
  const schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(decoded);
  if (!schemeMatch) return value;

  const scheme = `${schemeMatch[1].toLowerCase()}:`;
  return ALLOWED_URL_SCHEMES.includes(scheme) ? value : '';
}

function decodeNumericEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-f]{1,6});?/gi, (_, hex: string) => codePointToString(parseInt(hex, 16)))
    .replace(/&#([0-9]{1,7});?/g, (_, dec: string) => codePointToString(parseInt(dec, 10)))
    .replace(/&colon;/gi, ':')
    .replace(/&sol;/gi, '/');
}

function stripControlAndWhitespace(input: string): string {
  let output = '';
  for (const char of input) {
    const code = char.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) continue;
    if (/\s/.test(char)) continue;
    output += char;
  }
  return output;
}

function codePointToString(code: number): string {
  if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return '';
  return String.fromCodePoint(code);
}

export function createMarkedInstance(existingTitles: Set<string>) {
  const m = new Marked({
    gfm: true,
    breaks: true,
  });

  m.use({
    renderer: {
      html({ text }) {
        // Raw HTML is treated as text. Note bodies can come from imports and
        // shared backups, so they must never become live DOM.
        return escapeHtml(text);
      },
      link({ href, title, tokens }) {
        const safeHref = sanitizeUrl(href || '');
        const label = this.parser.parseInline(tokens);
        if (!safeHref) return label;

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        const isExternal = /^https?:/i.test(safeHref);
        const targetAttr = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
        return `<a href="${escapeHtml(safeHref)}"${titleAttr}${targetAttr}>${label}</a>`;
      },
      image({ href, title, text }) {
        const safeHref = sanitizeUrl(href || '');
        const alt = escapeHtml(text || '');
        if (!safeHref) return alt;

        const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
        return `<img src="${escapeHtml(safeHref)}" alt="${alt}"${titleAttr} loading="lazy" />`;
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
    ],
  });

  return m;
}

export function renderMarkdown(markdown: string, existingTitles: Set<string>): string {
  if (!markdown) return '';
  // Normalize headings typed without spaces like "##hello" -> "## hello"
  const normalized = markdown.replace(/^(#{1,6})([^\s#])/gm, '$1 $2');
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
