/**
 * Helpers for separating Markdown prose from code regions.
 *
 * Link and tag extraction must ignore fenced blocks and inline code spans,
 * otherwise every code sample that mentions `[[Something]]` or `#docker`
 * becomes a real workspace relationship. Masking keeps the line and character
 * offsets stable, which matters for the snippet extraction in buildBacklinks().
 */

const FENCE_PATTERN = /^(\s{0,3})(`{3,}|~{3,})(.*)$/;

function mapLines(
  markdown: string,
  mapper: (line: string, isCode: boolean) => string
): string {
  if (!markdown) return '';

  const lines = markdown.split('\n');
  const output: string[] = [];
  let fenceChar = '';
  let fenceLength = 0;

  for (const line of lines) {
    const fenceMatch = FENCE_PATTERN.exec(line);

    if (fenceMatch) {
      const marker = fenceMatch[2];
      if (!fenceChar) {
        fenceChar = marker[0];
        fenceLength = marker.length;
      } else if (marker[0] === fenceChar && marker.length >= fenceLength) {
        fenceChar = '';
        fenceLength = 0;
      }
      output.push(mapper(line, true));
      continue;
    }

    output.push(mapper(line, fenceChar !== ''));
  }

  return output.join('\n');
}

function maskInlineCode(line: string): string {
  return line.replace(/(`+)([\s\S]*?)\1(?!`)/g, match => ' '.repeat(match.length));
}

/**
 * Replace every code region with spaces. Newlines and line lengths are kept,
 * so callers can match on the result and still use offsets against the
 * original text.
 */
export function maskCodeRegions(markdown: string): string {
  return mapLines(markdown, (line, isCode) =>
    isCode ? ' '.repeat(line.length) : maskInlineCode(line)
  );
}

/**
 * Apply a per-line transform to prose lines only. Fenced code lines, including
 * their fence markers, are returned unchanged.
 */
export function transformOutsideFences(
  markdown: string,
  transform: (line: string) => string
): string {
  return mapLines(markdown, (line, isCode) => (isCode ? line : transform(line)));
}
