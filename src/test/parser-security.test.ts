import { describe, it, expect } from 'vitest';
import { renderMarkdown, sanitizeUrl } from '../core/markdown/parser';

const existingTitles = new Set<string>();

describe('Markdown preview security', () => {
  it('escapes raw HTML blocks and inline tags instead of attaching them to the DOM', () => {
    const html = renderMarkdown(
      '<img src=x onerror="alert(1)">\n\n<script>window.pwned = true;</script>',
      existingTitles
    );

    expect(html).not.toContain('<img');
    expect(html).not.toContain('<script');
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script');
  });

  it('drops javascript and data link targets while keeping the visible label', () => {
    const html = renderMarkdown(
      '[click](javascript:alert(1)) and [doc](data:text/html;base64,PHNjcmlwdD4=)',
      existingTitles
    );

    expect(html).not.toMatch(/href="javascript:/i);
    expect(html).not.toMatch(/href="data:/i);
    expect(html).toContain('click');
    expect(html).toContain('doc');
  });

  it('rejects entity encoded schemes before the href is written', () => {
    const html = renderMarkdown(
      '[x](java&#115;cript:alert(1)) [y](java&colon;script:alert(1))',
      existingTitles
    );

    expect(html).not.toMatch(/href="java/i);
    expect(html).not.toContain('alert(1)');
  });

  it('keeps safe absolute and relative links and marks external ones', () => {
    const html = renderMarkdown(
      '[site](https://example.com/docs) [mail](mailto:test@example.com) [local](/notes/local.md) [top](#top)',
      existingTitles
    );

    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('href="mailto:test@example.com"');
    expect(html).toContain('href="/notes/local.md"');
    expect(html).toContain('href="#top"');
  });

  it('rejects unsafe image sources and keeps the alt text', () => {
    const html = renderMarkdown('![diagram](javascript:alert(1))', existingTitles);

    expect(html).not.toContain('<img');
    expect(html).toContain('diagram');
  });

  it('sanitizeUrl handles common bypass shapes', () => {
    expect(sanitizeUrl('javascript:alert(1)')).toBe('');
    expect(sanitizeUrl('  JaVaScRiPt:alert(1)')).toBe('');
    expect(sanitizeUrl('java\nscript:alert(1)')).toBe('');
    expect(sanitizeUrl('data:text/html,<script>1</script>')).toBe('');
    expect(sanitizeUrl('vbscript:msgbox(1)')).toBe('');
    expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    expect(sanitizeUrl('http://localhost:3000/notes')).toBe('http://localhost:3000/notes');
    expect(sanitizeUrl('#anchor')).toBe('#anchor');
    expect(sanitizeUrl('./local.md')).toBe('./local.md');
    expect(sanitizeUrl('/absolute/path.md')).toBe('/absolute/path.md');
  });
});
