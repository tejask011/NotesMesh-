import { PluginInstance, PluginContext } from '../domain/plugin';

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
  private activatingPlugins: Set<string> = new Set();
  private activePlugins: Set<string> = new Set();
  private currentContentProvider: () => string = () => '';

  setCurrentContentProvider(provider: () => string) {
    this.currentContentProvider = provider;
  }

  notifyNoteChanged(content: string) {
    this.noteChangeListeners.forEach(pluginListeners => {
      pluginListeners.forEach(cb => {
        try {
          cb(content);
        } catch (err) {
          console.error('Plugin onNoteChange listener error:', err);
        }
      });
    });
  }

  registerPlugin(plugin: PluginInstance) {
    const pluginId = plugin.manifest.id;
    const existing = this.plugins.get(pluginId);
    if (existing === plugin) return;

    if (existing) {
      this.removePluginRegistrations(pluginId);
      this.noteChangeListeners.delete(pluginId);
    }

    this.plugins.set(pluginId, plugin);
    if (plugin.enabled) {
      this.activatePlugin(pluginId);
    }
  }

  async activatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;
    if (this.activePlugins.has(pluginId) || this.activatingPlugins.has(pluginId)) return true;

    this.activatingPlugins.add(pluginId);

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
        let pluginListeners = this.noteChangeListeners.get(pluginId);
        if (!pluginListeners) {
          pluginListeners = new Set();
          this.noteChangeListeners.set(pluginId, pluginListeners);
        }
        pluginListeners.add(cb);

        return () => {
          pluginListeners?.delete(cb);
        };
      },
    };

    try {
      await plugin.onLoad(context);
      this.activePlugins.add(pluginId);
      plugin.enabled = true;
      this.notifyState();
      return true;
    } catch (err) {
      console.error(`Failed to activate plugin ${pluginId}:`, err);
      this.removePluginRegistrations(pluginId);
      this.noteChangeListeners.delete(pluginId);
      return false;
    } finally {
      this.activatingPlugins.delete(pluginId);
    }
  }

  async deactivatePlugin(pluginId: string): Promise<boolean> {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return false;

    if (this.activePlugins.has(pluginId)) {
      try {
        await plugin.onUnload();
      } catch (err) {
        console.error(`Error unloading plugin ${pluginId}:`, err);
      }
    }

    this.activePlugins.delete(pluginId);
    this.removePluginRegistrations(pluginId);
    this.noteChangeListeners.delete(pluginId);
    plugin.enabled = false;
    this.notifyState();
    return true;
  }

  private removePluginRegistrations(pluginId: string) {
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
