import { PluginInstance } from '../domain/plugin';

/**
 * Sample Plugin 1: Word Count & Reading Time
 * Demonstrates: status bar updates, listening to note changes, metrics calculation.
 */
export const WordCountPlugin: PluginInstance = {
  manifest: {
    id: 'notemesh-plugin-word-count',
    name: 'Word Count & Reading Time',
    version: '1.0.0',
    description:
      'Displays live word count, character count, and estimated reading time in the status bar.',
    author: 'NoteMesh Community',
    permissions: ['statusbar'],
  },
  enabled: true,
  onLoad: context => {
    const updateStats = (content: string) => {
      const words = content.trim() ? content.trim().split(/\s+/).length : 0;
      const chars = content.length;
      const readingMinutes = Math.ceil(words / 200);
      const text = `${words} words · ${chars} chars · ~${readingMinutes} min read`;
      context.updateStatusBarItem('word-counter', text);
    };

    context.addStatusBarItem({
      id: 'word-counter',
      text: 'Calculating...',
      tooltip: 'Live document statistics',
    });

    const initial = context.getCurrentNoteContent();
    updateStats(initial);

    if (context.onNoteChange) {
      context.onNoteChange(updateStats);
    }
  },
  onUnload: () => {
    // Cleanup handled by plugin manager
  },
};

/**
 * Sample Plugin 2: Markdown File Exporter
 * Demonstrates: registering commands into the Command Palette.
 */
export const MarkdownExportPlugin: PluginInstance = {
  manifest: {
    id: 'notemesh-plugin-exporter',
    name: 'Quick Markdown Exporter',
    version: '1.0.0',
    description: 'Adds command to quickly export the currently active note as a standard .md file.',
    author: 'NoteMesh Community',
    permissions: ['commands', 'export'],
  },
  enabled: true,
  onLoad: context => {
    context.registerCommand({
      id: 'export-current-md',
      title: 'Export: Download Active Note as .md',
      shortcut: 'Ctrl+Shift+E',
      handler: () => {
        const content = context.getCurrentNoteContent();
        const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'NoteMesh-Export.md';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      },
    });
  },
  onUnload: () => {},
};

/**
 * Sample Plugin 3: Table of Contents Generator
 * Demonstrates: parsing headings, clipboard copy, and command palette integration.
 */
export const TableOfContentsPlugin: PluginInstance = {
  manifest: {
    id: 'notemesh-plugin-toc',
    name: 'Table of Contents Generator',
    version: '1.0.0',
    description:
      'Extracts all headings from the active note and copies a Markdown Table of Contents.',
    author: 'NoteMesh Community',
    permissions: ['commands'],
  },
  enabled: true,
  onLoad: context => {
    context.registerCommand({
      id: 'generate-toc',
      title: 'Note: Copy Table of Contents to Clipboard',
      // Ctrl+Shift+T can't be used: browsers reserve it for "reopen closed tab".
      shortcut: 'Alt+Shift+T',
      handler: () => {
        const content = context.getCurrentNoteContent();
        const lines = content.split('\n');
        const tocLines: string[] = ['### Table of Contents\n'];

        lines.forEach(line => {
          const match = line.match(/^(#{1,6})\s+(.+)$/);
          if (match) {
            const level = match[1].length;
            const title = match[2].trim();
            const indent = '  '.repeat(Math.max(0, level - 1));
            const slug = title
              .toLowerCase()
              .replace(/[^\w\s-]/g, '')
              .replace(/\s+/g, '-');
            tocLines.push(`${indent}- [${title}](#${slug})`);
          }
        });

        if (tocLines.length <= 1) {
          alert('No headings found in the active note.');
          return;
        }

        const tocText = tocLines.join('\n');
        navigator.clipboard.writeText(tocText).then(() => {
          alert('Table of Contents copied to clipboard! Paste it wherever you like.');
        });
      },
    });
  },
  onUnload: () => {},
};
