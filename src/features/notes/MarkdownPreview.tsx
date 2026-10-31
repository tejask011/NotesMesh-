import React, { useDeferredValue, useEffect, useMemo, useRef } from 'react';
import { renderMarkdown } from '../../core/markdown/parser';
import { renderMath, renderMermaid } from './richContent';

interface MarkdownPreviewProps {
  content: string;
  existingTitles: Set<string>;
  onNavigateWikilink: (targetTitle: string) => void;
}

export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  existingTitles,
  onNavigateWikilink,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  // Parsing a long note shouldn't delay the keystroke that changed it.
  const deferredContent = useDeferredValue(content);

  const html = useMemo(() => {
    return renderMarkdown(deferredContent, existingTitles);
  }, [deferredContent, existingTitles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const isDarkMode = document.documentElement.classList.contains('dark');
    renderMath(container).catch(error => console.error('Math rendering failed:', error));
    renderMermaid(container, isDarkMode).catch(error =>
      console.error('Diagram rendering failed:', error)
    );
  }, [html]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('.wikilink-pill');
    if (target) {
      const linkTarget = target.getAttribute('data-wikilink');
      if (linkTarget) {
        onNavigateWikilink(linkTarget);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      onClick={handleClick}
      className="markdown-body p-6 overflow-y-auto max-w-4xl mx-auto w-full h-full"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
