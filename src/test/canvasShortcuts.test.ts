import { describe, it, expect } from 'vitest';
import { resolveCanvasShortcut, CanvasShortcutEvent } from '../core/canvas/shortcuts';

const base: CanvasShortcutEvent = {
  key: 'z',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
};

const resolve = (patch: Partial<CanvasShortcutEvent>, editable = false) =>
  resolveCanvasShortcut({ ...base, ...patch }, editable);

describe('canvas shortcuts', () => {
  it('maps Ctrl+Z and Cmd+Z to undo', () => {
    expect(resolve({ ctrlKey: true })).toBe('undo');
    expect(resolve({ metaKey: true })).toBe('undo');
  });

  it('maps shifted undo to redo on both platforms', () => {
    expect(resolve({ ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(resolve({ metaKey: true, shiftKey: true })).toBe('redo');
  });

  it('maps Ctrl+Y and Cmd+Y to redo', () => {
    expect(resolve({ key: 'y', ctrlKey: true })).toBe('redo');
    expect(resolve({ key: 'y', metaKey: true })).toBe('redo');
  });

  it('maps Ctrl+D and Cmd+D to duplicate', () => {
    expect(resolve({ key: 'd', ctrlKey: true })).toBe('duplicate');
    expect(resolve({ key: 'd', metaKey: true })).toBe('duplicate');
  });

  it('maps Delete and Backspace to delete without a modifier', () => {
    expect(resolve({ key: 'Delete' })).toBe('delete');
    expect(resolve({ key: 'Backspace' })).toBe('delete');
  });

  it('maps Escape to cancel', () => {
    expect(resolve({ key: 'Escape' })).toBe('cancel');
  });

  it('ignores every shortcut while an editable field has focus', () => {
    expect(resolve({ ctrlKey: true }, true)).toBeNull();
    expect(resolve({ key: 'Delete' }, true)).toBeNull();
    expect(resolve({ key: 'Escape' }, true)).toBeNull();
  });

  it('ignores plain letters and modifier combinations it does not own', () => {
    expect(resolve({})).toBeNull();
    expect(resolve({ key: 'd' })).toBeNull();
    expect(resolve({ key: 'Delete', ctrlKey: true })).toBeNull();
    expect(resolve({ key: 'z', altKey: true })).toBeNull();
    expect(resolve({ key: 'z', ctrlKey: true, altKey: true })).toBeNull();
    expect(resolve({ key: 'x', ctrlKey: true })).toBeNull();
  });

  it('normalises capitalised keys from shifted input', () => {
    expect(resolve({ key: 'Z', ctrlKey: true, shiftKey: true })).toBe('redo');
    expect(resolve({ key: 'D', metaKey: true })).toBe('duplicate');
  });
});
