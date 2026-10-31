import { BLOCK_MATH_CLASS, INLINE_MATH_CLASS, MERMAID_CLASS } from '../../core/markdown/parser';

/**
 * Upgrades the placeholders parser.ts leaves in the preview. KaTeX and Mermaid
 * are bundled with the app (no CDN, works offline) but split into their own
 * chunks, so notes that don't use them never pay for them.
 */
const svgCache = new Map<string, string>();
let mermaidRenderCount = 0;

function showError(element: Element, message: string): void {
  const error = document.createElement('div');
  error.className = 'render-error';
  error.textContent = message;
  element.after(error);
}

export async function renderMath(container: HTMLElement): Promise<void> {
  const elements = container.querySelectorAll<HTMLElement>(
    `.${INLINE_MATH_CLASS}, .${BLOCK_MATH_CLASS}`
  );
  if (elements.length === 0) return;

  const [{ default: katex }] = await Promise.all([
    import('katex'),
    import('katex/dist/katex.min.css'),
  ]);

  elements.forEach(element => {
    if (element.dataset.rendered) return;
    // trust: false blocks \href and friends; throwOnError: false shows bad input in red.
    katex.render(element.textContent ?? '', element, {
      displayMode: element.classList.contains(BLOCK_MATH_CLASS),
      throwOnError: false,
      trust: false,
    });
    element.dataset.rendered = 'true';
  });
}

export async function renderMermaid(container: HTMLElement, isDarkMode: boolean): Promise<void> {
  const blocks = Array.from(container.querySelectorAll<HTMLElement>(`pre.${MERMAID_CLASS}`));
  if (blocks.length === 0) return;

  const { default: mermaid } = await import('mermaid');
  mermaid.initialize({
    startOnLoad: false,
    // 'strict' disables click handlers and script-like labels in diagrams from untrusted notes.
    securityLevel: 'strict',
    theme: isDarkMode ? 'dark' : 'default',
    flowchart: { htmlLabels: false },
  });

  for (const block of blocks) {
    if (block.dataset.rendered) continue;
    const source = block.textContent ?? '';
    const cacheKey = `${isDarkMode}:${source}`;
    try {
      let svg = svgCache.get(cacheKey);
      if (!svg) {
        mermaidRenderCount += 1;
        ({ svg } = await mermaid.render(`mermaid-${mermaidRenderCount}`, source));
        svgCache.set(cacheKey, svg);
      }
      // The note may have changed while this was rendering.
      if (!block.isConnected) continue;
      block.innerHTML = svg;
      block.classList.add('mermaid-rendered');
      block.dataset.rendered = 'true';
    } catch (error) {
      // Partial typing is routinely invalid: keep the source visible and say why.
      if (block.isConnected) {
        block.dataset.rendered = 'error';
        showError(block, `Diagram error: ${(error as Error).message.split('\n')[0]}`);
      }
    }
  }
}
