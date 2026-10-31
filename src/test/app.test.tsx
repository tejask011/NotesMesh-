import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { JOURNAL_KEY } from '../core/storage/saveQueue';
import { WORKSPACE_KEY } from '../core/storage/localStorageAdapter';
import { CURRENT_SCHEMA_VERSION } from '../core/storage/schema';
import { PluginManager } from '../core/plugins/pluginManager';
import { PluginInstance } from '../core/domain/plugin';

/**
 * The storage singletons live in module scope, so every test imports a fresh
 * copy of the app against a clean database, just like a page load.
 */
let current: typeof import('../core/storage') | null = null;

async function loadApp() {
  vi.resetModules();
  const [{ App }, storageModule] = await Promise.all([import('../App'), import('../core/storage')]);
  current = storageModule;
  render(<App />);
  await waitFor(() => expect(screen.queryByText('Opening your workspace...')).toBeNull());
  return storageModule;
}

const deleteDatabase = () =>
  new Promise<void>(resolve => {
    const request = indexedDB.deleteDatabase('notemesh');
    request.onsuccess = request.onerror = request.onblocked = () => resolve();
  });

const pressKey = (init: KeyboardEventInit) => fireEvent.keyDown(window, init);

describe('app shell', () => {
  beforeEach(async () => {
    // Settle the previous test's queue, so its timers can't write into this test's database.
    current?.saveQueue.discardPending();
    current = null;
    await deleteDatabase();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('global keyboard shortcuts', () => {
    it('Ctrl+K opens and closes the command palette', async () => {
      await loadApp();
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
      pressKey({ key: 'k', ctrlKey: true });
      expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
      pressKey({ key: 'k', ctrlKey: true });
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    });

    it('Cmd+K works on macOS, even from inside the editor', async () => {
      await loadApp();
      fireEvent.keyDown(screen.getByLabelText('Note text'), { key: 'k', metaKey: true });
      expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    });

    it('Ctrl+S saves now instead of opening the browser save dialog', async () => {
      await loadApp();
      fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'typed' } });
      expect(pressKey({ key: 's', ctrlKey: true })).toBe(false);
      expect(await screen.findByText('All changes saved.')).toBeTruthy();
    });

    it('Alt+Shift+N creates a note with a unique title', async () => {
      await loadApp();
      pressKey({ key: 'N', code: 'KeyN', altKey: true, shiftKey: true });
      expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe('Untitled Note');
      pressKey({ key: 'N', code: 'KeyN', altKey: true, shiftKey: true });
      expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe(
        'Untitled Note (2)'
      );
    });

    it("Alt+Shift+D opens today's daily note, reusing it the second time", async () => {
      await loadApp();
      pressKey({ key: 'D', code: 'KeyD', altKey: true, shiftKey: true });
      const title = (screen.getByLabelText('Note title') as HTMLInputElement).value;
      expect(title).toMatch(/^Daily Note - \d{4}-\d{2}-\d{2}$/);
      pressKey({ key: 'D', code: 'KeyD', altKey: true, shiftKey: true });
      expect(screen.getAllByText(title).length).toBeGreaterThan(0);
    });

    it('plugin shortcuts run their commands', async () => {
      const blob = vi.spyOn(URL, 'createObjectURL');
      await loadApp();
      expect(pressKey({ key: 'E', code: 'KeyE', ctrlKey: true, shiftKey: true })).toBe(false);
      expect(blob).toHaveBeenCalled();
    });
  });

  describe('command palette keyboard use', () => {
    it('arrows move the highlight, Enter runs it, Esc closes', async () => {
      await loadApp();
      pressKey({ key: 'k', ctrlKey: true });
      const dialog = screen.getByRole('dialog', { name: 'Command palette' });
      const input = within(dialog).getByLabelText('Search notes or run commands');

      fireEvent.change(input, { target: { value: 'Open Knowledge Graph' } });
      expect(within(dialog).getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
      // Similar notes rank above commands, so walk down to the command itself.
      while (
        !within(dialog)
          .getByRole('option', { selected: true })
          .textContent?.includes('Open Knowledge Graph')
      ) {
        fireEvent.keyDown(input, { key: 'ArrowDown' });
      }
      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
      expect(screen.getByTestId('graph-canvas')).toBeTruthy();

      pressKey({ key: 'k', ctrlKey: true });
      const reopened = screen.getByLabelText('Search notes or run commands');
      fireEvent.keyDown(reopened, { key: 'ArrowDown' });
      const options = within(screen.getByRole('dialog', { name: 'Command palette' })).getAllByRole(
        'option'
      );
      expect(options[0].getAttribute('aria-selected')).toBe('false');
      expect(options[1].getAttribute('aria-selected')).toBe('true');
      fireEvent.keyDown(reopened, { key: 'ArrowUp' });
      fireEvent.keyDown(reopened, { key: 'ArrowUp' });
      expect(options[options.length - 1].getAttribute('aria-selected')).toBe('true');
      fireEvent.keyDown(reopened, { key: 'Escape' });
      expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    });
  });

  describe('save status', () => {
    it('shows unsaved changes, then saved, and persists exactly what was typed', async () => {
      const { storage, saveQueue } = await loadApp();
      const text = 'Launch 🚀 👩‍💻 क्‍ष';
      fireEvent.change(screen.getByLabelText('Note text'), { target: { value: text } });
      expect(screen.getAllByText('Unsaved changes').length).toBeGreaterThan(0);

      await act(async () => {
        await saveQueue.flush();
      });
      expect(screen.getAllByText('Saved').length).toBeGreaterThan(0);
      const notes = await storage.getNotes();
      expect(notes.some(n => n.content === text)).toBe(true);
    });

    it('shows a persistent banner with recovery options when saving fails', async () => {
      const { storage } = await loadApp();
      vi.spyOn(storage, 'saveNote').mockRejectedValue(
        new DOMException('full', 'QuotaExceededError')
      );
      fireEvent.change(screen.getByLabelText('Note text'), { target: { value: 'important' } });
      pressKey({ key: 's', ctrlKey: true });

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.getByText(/Browser storage is full/)).toBeTruthy();
      expect(screen.getByText('Retry now')).toBeTruthy();
      expect(screen.getByText('Download backup')).toBeTruthy();
      expect(screen.queryAllByText('Saved')).toHaveLength(0);
      expect(localStorage.getItem(JOURNAL_KEY)).toContain('important');

      // The text stays on screen, and retrying clears the error once storage recovers.
      expect((screen.getByLabelText('Note text') as HTMLTextAreaElement).value).toBe('important');
      vi.mocked(storage.saveNote).mockRestore();
      fireEvent.click(screen.getByText('Retry now'));
      await waitFor(() => expect(screen.queryByText('Retry now')).toBeNull());
    });

    it('recovers unsaved edits from the journal on the next launch', async () => {
      const { storage, saveQueue } = await loadApp();
      await act(async () => {
        await saveQueue.flush();
      });
      const [first] = await storage.getNotes();
      localStorage.setItem(
        JOURNAL_KEY,
        JSON.stringify([
          {
            kind: 'putNote',
            note: { ...first, content: 'recovered after crash', updatedAt: first.updatedAt + 1000 },
          },
        ])
      );

      const fresh = await loadApp();
      await waitFor(async () => {
        expect(
          (await fresh.storage.getNotes()).some(n => n.content === 'recovered after crash')
        ).toBe(true);
      });
    });
  });

  describe('storage recovery screen', () => {
    it('appears instead of sample data when storage is corrupted, and never overwrites it', async () => {
      // Force the localStorage engine, where a truncated write can leave invalid JSON.
      vi.stubGlobal('indexedDB', undefined);
      localStorage.setItem(WORKSPACE_KEY, '{"notes":[{"id":"my-precious-note"');
      await loadApp();

      expect(await screen.findByText(/couldn't be opened/)).toBeTruthy();
      expect(screen.queryByLabelText('Note text')).toBeNull();
      expect(screen.getByText('Restore from a backup file')).toBeTruthy();
      expect(screen.getByText('Start a new workspace')).toBeTruthy();
      expect(localStorage.getItem(WORKSPACE_KEY)).toContain('my-precious-note');
      vi.unstubAllGlobals();
    });

    it('offers the raw data for download, and can start fresh', async () => {
      vi.stubGlobal('indexedDB', undefined);
      localStorage.setItem(WORKSPACE_KEY, 'garbage');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      await loadApp();

      expect(await screen.findByText(/Download the unreadable data/)).toBeTruthy();
      fireEvent.click(screen.getByText('Start a new workspace'));
      expect(await screen.findByLabelText('Note text')).toBeTruthy();
      vi.unstubAllGlobals();
    });

    it('explains when the data is from a newer version', async () => {
      vi.stubGlobal('indexedDB', undefined);
      localStorage.setItem(
        WORKSPACE_KEY,
        JSON.stringify({ schemaVersion: CURRENT_SCHEMA_VERSION + 1, notes: [], canvases: [] })
      );
      await loadApp();
      expect(await screen.findByText(/newer version of NoteMesh/)).toBeTruthy();
      vi.unstubAllGlobals();
    });
  });

  describe('multiple boards', () => {
    const openCanvas = () => fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));

    it("creates, switches, renames and deletes boards, keeping each board's contents", async () => {
      const { storage, saveQueue } = await loadApp();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      openCanvas();
      const original = screen.getByRole('tab', { selected: true }).textContent as string;
      expect(document.querySelectorAll('[data-element-id]').length).toBeGreaterThan(0);

      fireEvent.click(screen.getByText('New board'));
      expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Untitled Board');
      expect(document.querySelectorAll('[data-element-id]')).toHaveLength(0);

      fireEvent.click(screen.getByLabelText('Rename board Untitled Board'));
      fireEvent.change(screen.getByLabelText('Board name'), { target: { value: 'Ideas' } });
      fireEvent.keyDown(screen.getByLabelText('Board name'), { key: 'Enter' });
      expect(screen.getByRole('tab', { selected: true }).textContent).toBe('Ideas');

      fireEvent.click(screen.getByRole('tab', { name: original }));
      expect(document.querySelectorAll('[data-element-id]').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('tab', { name: 'Ideas' }));
      expect(document.querySelectorAll('[data-element-id]')).toHaveLength(0);

      await act(async () => {
        await saveQueue.flush();
      });
      expect((await storage.getCanvases()).map(c => c.title).sort()).toEqual(
        [original, 'Ideas'].sort()
      );

      fireEvent.click(screen.getByLabelText('Delete board Ideas'));
      expect(screen.queryByRole('tab', { name: 'Ideas' })).toBeNull();
      await act(async () => {
        await saveQueue.flush();
      });
      expect(await storage.getCanvases()).toHaveLength(1);
    });

    it('undo history does not leak between boards', async () => {
      await loadApp();
      openCanvas();
      fireEvent.click(screen.getByText('New board'));
      expect((screen.getByTitle('Undo (Ctrl+Z)') as HTMLButtonElement).disabled).toBe(true);

      pressKey({ key: 'z', ctrlKey: true });
      expect(document.querySelectorAll('[data-element-id]')).toHaveLength(0);
    });
  });

  describe('folders and tags', () => {
    it('shows nested folders as a tree and creates notes inside them', async () => {
      await loadApp();
      const folderInput = screen.getByLabelText('Folder path');
      fireEvent.change(folderInput, { target: { value: 'Projects/2026/Alpha' } });
      fireEvent.blur(folderInput);

      const tree = screen.getByRole('tree', { name: 'Folders' });
      for (const path of ['Projects', 'Projects/2026', 'Projects/2026/Alpha']) {
        expect(within(tree).getByRole('treeitem', { name: path })).toBeTruthy();
      }

      fireEvent.click(screen.getByTitle('New note in Projects/2026/Alpha'));
      expect((screen.getByLabelText('Folder path') as HTMLInputElement).value).toBe(
        'Projects/2026/Alpha'
      );
    });

    it('renames a folder across all of its notes and subfolders', async () => {
      await loadApp();
      const folderInput = screen.getByLabelText('Folder path');
      fireEvent.change(folderInput, { target: { value: 'Old/Sub' } });
      fireEvent.blur(folderInput);

      vi.spyOn(window, 'prompt').mockReturnValue('New');
      fireEvent.click(screen.getByTitle('Rename or move Old'));
      expect(screen.getByRole('treeitem', { name: 'New/Sub' })).toBeTruthy();
      expect(screen.queryByRole('treeitem', { name: 'Old' })).toBeNull();
    });

    it('refuses to move a folder inside itself', async () => {
      await loadApp();
      const folderInput = screen.getByLabelText('Folder path');
      fireEvent.change(folderInput, { target: { value: 'Keep' } });
      fireEvent.blur(folderInput);
      vi.spyOn(window, 'prompt').mockReturnValue('Keep/Inner');
      fireEvent.click(screen.getByTitle('Rename or move Keep'));
      expect(screen.getByRole('treeitem', { name: 'Keep' })).toBeTruthy();
      expect(await screen.findByText(/cannot be moved inside itself/)).toBeTruthy();
    });

    it('lists inline #tags in the sidebar and filters by them', async () => {
      await loadApp();
      fireEvent.change(screen.getByLabelText('Note text'), {
        target: { value: 'writing about #inlineonly' },
      });
      const tagButton = await screen.findByRole('button', { name: '#inlineonly' });
      fireEvent.click(tagButton);
      expect(screen.getByText('Clear Filter ✕')).toBeTruthy();
    });

    it('keeps pinned notes visible in their folder as well', async () => {
      await loadApp();
      const title = (screen.getByLabelText('Note title') as HTMLInputElement).value;
      const pin = screen.getAllByTitle('Unpin')[0];
      expect(pin).toBeTruthy();
      expect(screen.getAllByText(title).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('file import', () => {
    const importFiles = (files: File[]) =>
      fireEvent.change(screen.getByLabelText('Import Markdown files'), { target: { files } });

    it('imports several files, and reports unsupported ones', async () => {
      await loadApp();
      importFiles([
        new File(['# One 🚀'], 'one.md'),
        new File(['two'], 'two.txt'),
        new File(['x'], 'picture.png'),
      ]);
      expect(await screen.findByText(/Imported 2 notes/)).toBeTruthy();
      expect(screen.getByText(/picture.png \(Unsupported file type/)).toBeTruthy();
      expect((screen.getByLabelText('Note text') as HTMLTextAreaElement).value).toBe('# One 🚀');
    });

    it('renames duplicates rather than creating ambiguous titles', async () => {
      await loadApp();
      importFiles([new File(['a'], 'Welcome to NoteMesh.md')]);
      expect(await screen.findByText(/Renamed to avoid duplicates/)).toBeTruthy();
      expect((screen.getByLabelText('Note title') as HTMLInputElement).value).toBe(
        'Welcome to NoteMesh (2)'
      );
    });

    it('reports a read failure for one file and still imports the others', async () => {
      await loadApp();
      const original = FileReader.prototype.readAsArrayBuffer;
      vi.spyOn(FileReader.prototype, 'readAsArrayBuffer').mockImplementation(function (
        this: FileReader,
        blob: Blob
      ) {
        if ((blob as File).name === 'locked.md') {
          queueMicrotask(() =>
            this.onerror?.(new ProgressEvent('error') as ProgressEvent<FileReader>)
          );
        } else {
          original.call(this, blob);
        }
      });
      importFiles([new File(['fine'], 'fine.md'), new File(['x'], 'locked.md')]);
      expect(await screen.findByText(/Imported 1 note/)).toBeTruthy();
      expect(screen.getByText(/locked\.md/)).toBeTruthy();
    });
  });

  describe('settings', () => {
    const openSettings = () => fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    it('rejects an invalid backup and keeps the workspace', async () => {
      const { storage } = await loadApp();
      const before = (await storage.getNotes()).length;
      openSettings();
      fireEvent.change(screen.getByLabelText('Workspace backup file'), {
        target: { files: [new File(['{"notes": 1}'], 'bad.json')] },
      });
      expect(await screen.findByText(/bad\.json was not restored/)).toBeTruthy();
      expect(await storage.getNotes()).toHaveLength(before);
    });

    it('restores a backup end to end after confirmation', async () => {
      const { storage } = await loadApp();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      openSettings();
      const backup = JSON.stringify({
        notes: [
          { id: 'r', title: 'Restored 🚀', content: 'Back', tags: [], createdAt: 1, updatedAt: 1 },
        ],
        canvases: [],
      });
      fireEvent.change(screen.getByLabelText('Workspace backup file'), {
        target: { files: [new File([backup], 'good.json')] },
      });
      expect(await screen.findByText('Restored 1 note and 0 boards.')).toBeTruthy();
      expect((await storage.getNotes()).map(n => n.title)).toEqual(['Restored 🚀']);
      expect(await screen.findByText(/Before restoring a backup/)).toBeTruthy();
    });

    it('does not restore if the user declines the confirmation', async () => {
      const { storage } = await loadApp();
      const before = (await storage.getNotes()).length;
      vi.spyOn(window, 'confirm').mockReturnValue(false);
      openSettings();
      const backup = JSON.stringify({ notes: [], canvases: [] });
      fireEvent.change(screen.getByLabelText('Workspace backup file'), {
        target: { files: [new File([backup], 'good.json')] },
      });
      await waitFor(() => expect(window.confirm).toHaveBeenCalled());
      expect(await storage.getNotes()).toHaveLength(before);
    });

    it('reset keeps the theme preference and leaves an undo snapshot', async () => {
      const { storage } = await loadApp();
      localStorage.setItem('notemesh_theme', 'light');
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      openSettings();
      fireEvent.click(screen.getByText('Reset to Clean Default Workspace'));
      await waitFor(async () => {
        expect(
          (await storage.listSnapshots()).some(s => s.reason === 'Before resetting the workspace')
        ).toBe(true);
      });
      expect(localStorage.getItem('notemesh_theme')).toBe('light');
    });

    it('sync is off by default and states its privacy and conflict behavior', async () => {
      await loadApp();
      openSettings();
      expect(screen.getByText('Sync (optional)')).toBeTruthy();
      expect(screen.getByText('Off')).toBeTruthy();
      expect(screen.getByText(/makes no network requests/)).toBeTruthy();
      expect(screen.getByText(/not encrypted/)).toBeTruthy();
      expect(screen.getByText(/Conflicts never lose text/)).toBeTruthy();
    });

    it('lists every registered shortcut', async () => {
      await loadApp();
      openSettings();
      for (const combo of [
        'Ctrl+K',
        'Ctrl+S',
        'Alt+Shift+N',
        'Ctrl+B',
        'Ctrl+Shift+E',
        'Alt+Shift+T',
      ]) {
        expect(screen.getByText(combo)).toBeTruthy();
      }
      expect(screen.queryByText('Ctrl+Shift+T')).toBeNull();
    });
  });

  it('opening a deleted note from a canvas card does not create a junk note', async () => {
    const { storage } = await loadApp();
    const before = (await storage.getNotes()).length;
    fireEvent.click(screen.getByRole('button', { name: 'Canvas' }));
    expect(screen.queryByText('deleted-note-id')).toBeNull();
    expect(await storage.getNotes()).toHaveLength(before);
  });
});

describe('plugin manager', () => {
  const plugin = (onNote: (content: string) => void): PluginInstance => ({
    manifest: { id: 'p', name: 'P', version: '1', description: '', author: '' },
    enabled: true,
    onLoad: context => {
      context.onNoteChange?.(onNote);
      context.registerCommand({
        id: 'c',
        title: 'C',
        shortcut: 'Ctrl+Shift+Y',
        handler: () => onNote('command'),
      });
    },
    onUnload: () => {},
  });

  it('activating twice does not double-register listeners (React StrictMode does this)', async () => {
    const manager = new PluginManager();
    const onNote = vi.fn();
    const instance = plugin(onNote);
    manager.registerPlugin(instance);
    manager.registerPlugin(instance);
    await Promise.resolve();
    manager.notifyNoteChanged('x');
    expect(onNote).toHaveBeenCalledTimes(1);
  });

  it('a disabled plugin stops receiving note changes and its shortcut stops working', async () => {
    const manager = new PluginManager();
    const onNote = vi.fn();
    manager.registerPlugin(plugin(onNote));
    await Promise.resolve();
    await manager.deactivatePlugin('p');
    manager.notifyNoteChanged('x');
    expect(onNote).not.toHaveBeenCalled();
    const event = new KeyboardEvent('keydown', {
      key: 'Y',
      code: 'KeyY',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(manager.runShortcut(event)).toBe(false);
  });

  it('runs a command from its shortcut', async () => {
    const manager = new PluginManager();
    const onNote = vi.fn();
    manager.registerPlugin(plugin(onNote));
    await Promise.resolve();
    const event = new KeyboardEvent('keydown', {
      key: 'Y',
      code: 'KeyY',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(manager.runShortcut(event)).toBe(true);
    expect(onNote).toHaveBeenCalledWith('command');
  });
});
