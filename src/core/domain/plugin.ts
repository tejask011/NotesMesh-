/**
 * Plugin API & Manifest Domain Models
 */

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  permissions?: ('commands' | 'statusbar' | 'themes' | 'export')[];
  minAppVersion?: string;
}

export interface PluginContext {
  registerCommand: (command: {
    id: string;
    title: string;
    shortcut?: string;
    handler: () => void;
  }) => void;
  addStatusBarItem: (item: {
    id: string;
    text: string;
    tooltip?: string;
    onClick?: () => void;
  }) => void;
  updateStatusBarItem: (id: string, text: string) => void;
  getCurrentNoteContent: () => string;
  onNoteChange?: (callback: (content: string) => void) => (() => void) | void;
}

export interface PluginInstance {
  manifest: PluginManifest;
  enabled: boolean;
  onLoad: (context: PluginContext) => Promise<void> | void;
  onUnload: () => Promise<void> | void;
}
