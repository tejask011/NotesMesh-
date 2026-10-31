import { PluginInstance, PluginContext } from '../domain/plugin';
import { matchesCombo } from '../shortcuts';

export interface RegisteredCommand {
  id: string;
  pluginId: string;
  title: string;
  shortcut?: string;
  handler: () => void;
}

export interface StatusBarItem {
  id: string;
  pluginId: string;
  text: string;
  tooltip?: string;
  onClick?: () => void;
}

export class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map();
  private commands: Map<string, RegisteredCommand> = new Map();
  private statusBarItems: Map<string, StatusBarItem> = new Map();
  private listeners: Set<() => void> = new Set();
  private noteChangeListeners: Map<string, Set<(content: string) => void>> = new Map();
  private activePlugins: Set<string> = new Set();
  private currentContentProvider: () => string = () => '';

  setCurrentContentProvider(provider: () => string) {
    this.currentContentProvider = provider;
  }

  notifyNoteChanged(content: string) {
    this.noteChangeListeners.forEach(listeners => {
      listeners.forEach(cb => {
        try {
          cb(content);
        } catch (err) {
          console.error('Plugin onNoteChange listener error:', err);
        }
      });
    });
  }

  registerPlugin(plugin: PluginInstance) {
    this.plugins.set(plugin.manifest.id, plugin);
    if (plugin.enabled) {
      this.activatePlugin(plugin.manifest.id);
    }
  }

  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    // Activating twice would double-register listeners.
    if (this.activePlugins.has(pluginId)) return true;
    this.activePlugins.add(pluginId);

    const context: PluginContext = {
      registerCommand: cmd => {
        this.commands.set(`${pluginId}:${cmd.id}`, {
          ...cmd,
          pluginId,
        });
        this.notifyState();
      },
      addStatusBarItem: item => {
        this.statusBarItems.set(`${pluginId}:${item.id}`, {
          ...item,
          pluginId,
        });
        this.notifyState();
      },
      updateStatusBarItem: (id, text) => {
        const key = `${pluginId}:${id}`;
        const existing = this.statusBarItems.get(key);
        if (existing) {
          this.statusBarItems.set(key, { ...existing, text });
          this.notifyState();
        }
      },
      getCurrentNoteContent: () => this.currentContentProvider(),
      onNoteChange: cb => {
        const listeners = this.noteChangeListeners.get(pluginId) ?? new Set();
        listeners.add(cb);
        this.noteChangeListeners.set(pluginId, listeners);
      },
    };

    try {
      await plugin.onLoad(context);
      plugin.enabled = true;
      this.notifyState();
      return true;
    } catch (err) {
      console.error(`Failed to activate plugin ${pluginId}:`, err);
      this.activePlugins.delete(pluginId);
      return false;
    }
  }

  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    try {
      await plugin.onUnload();
    } catch (err) {
      console.error(`Error unloading plugin ${pluginId}:`, err);
    }

    // Clean up commands and status bar items registered by this plugin
    for (const [key, cmd] of Array.from(this.commands.entries())) {
      if (cmd.pluginId === pluginId) {
        this.commands.delete(key);
      }
    }

    for (const [key, item] of Array.from(this.statusBarItems.entries())) {
      if (item.pluginId === pluginId) {
        this.statusBarItems.delete(key);
      }
    }

    this.noteChangeListeners.delete(pluginId);
    this.activePlugins.delete(pluginId);
    plugin.enabled = false;
    this.notifyState();
    return true;
  }

  /** Run the enabled command bound to this key press, if any. Returns whether one ran. */
  runShortcut(event: KeyboardEvent): boolean {
    for (const command of this.commands.values()) {
      if (command.shortcut && matchesCombo(event, command.shortcut)) {
        command.handler();
        return true;
      }
    }
    return false;
  }

  getAllPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values());
  }

  getCommands(): RegisteredCommand[] {
    return Array.from(this.commands.values());
  }

  getStatusBarItems(): StatusBarItem[] {
    return Array.from(this.statusBarItems.values());
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyState() {
    this.listeners.forEach(fn => fn());
  }
}

export const pluginManager = new PluginManager();
