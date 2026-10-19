import { describe, it, expect } from 'vitest';
import { PluginManager } from '../core/plugins/pluginManager';
import { PluginInstance } from '../core/domain/plugin';

describe('Plugin Manager & Extension System', () => {
  it('registers and activates a plugin, dispatching commands', async () => {
    const manager = new PluginManager();
    let commandExecuted = false;

    const testPlugin: PluginInstance = {
      manifest: {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        author: 'Tester',
      },
      enabled: false,
      onLoad: context => {
        context.registerCommand({
          id: 'test-cmd',
          title: 'Run Test Command',
          handler: () => {
            commandExecuted = true;
          },
        });
      },
      onUnload: () => {},
    };

    manager.registerPlugin(testPlugin);
    expect(manager.getCommands()).toHaveLength(0);

    // Activate
    const success = await manager.activatePlugin('test-plugin');
    expect(success).toBe(true);

    const commands = manager.getCommands();
    expect(commands).toHaveLength(1);
    expect(commands[0].title).toBe('Run Test Command');

    // Run command
    commands[0].handler();
    expect(commandExecuted).toBe(true);

    // Deactivate
    await manager.deactivatePlugin('test-plugin');
    expect(manager.getCommands()).toHaveLength(0);
  });

  it('releases note change listeners when a plugin is deactivated', async () => {
    const manager = new PluginManager();
    let notifications = 0;

    const plugin: PluginInstance = {
      manifest: {
        id: 'listener-plugin',
        name: 'Listener Plugin',
        version: '1.0.0',
        description: 'Tracks note changes',
        author: 'Tester',
      },
      enabled: false,
      onLoad: context => {
        context.onNoteChange?.(() => {
          notifications += 1;
        });
      },
      onUnload: () => {},
    };

    manager.registerPlugin(plugin);
    await manager.activatePlugin('listener-plugin');
    manager.notifyNoteChanged('first');
    expect(notifications).toBe(1);

    await manager.deactivatePlugin('listener-plugin');
    manager.notifyNoteChanged('second');
    expect(notifications).toBe(1);

    await manager.activatePlugin('listener-plugin');
    manager.notifyNoteChanged('third');
    expect(notifications).toBe(2);
  });

  it('returns an unsubscribe handle from onNoteChange', async () => {
    const manager = new PluginManager();
    let notifications = 0;
    let unsubscribe: (() => void) | void = () => {};

    const plugin: PluginInstance = {
      manifest: {
        id: 'unsubscribe-plugin',
        name: 'Unsubscribe Plugin',
        version: '1.0.0',
        description: 'Releases its listener manually',
        author: 'Tester',
      },
      enabled: false,
      onLoad: context => {
        unsubscribe = context.onNoteChange?.(() => {
          notifications += 1;
        });
      },
      onUnload: () => {},
    };

    manager.registerPlugin(plugin);
    await manager.activatePlugin('unsubscribe-plugin');
    manager.notifyNoteChanged('first');
    expect(notifications).toBe(1);

    unsubscribe?.();
    manager.notifyNoteChanged('second');
    expect(notifications).toBe(1);
  });

  it('activates a plugin once even when activation is requested twice', async () => {
    const manager = new PluginManager();
    let loadCount = 0;
    let notifications = 0;

    const plugin: PluginInstance = {
      manifest: {
        id: 'idempotent-plugin',
        name: 'Idempotent Plugin',
        version: '1.0.0',
        description: 'Should only load once',
        author: 'Tester',
      },
      enabled: false,
      onLoad: context => {
        loadCount += 1;
        context.onNoteChange?.(() => {
          notifications += 1;
        });
      },
      onUnload: () => {},
    };

    manager.registerPlugin(plugin);
    await manager.activatePlugin('idempotent-plugin');
    await manager.activatePlugin('idempotent-plugin');

    expect(loadCount).toBe(1);
    manager.notifyNoteChanged('note');
    expect(notifications).toBe(1);
  });

  it('rolls back commands and status items when onLoad throws', async () => {
    const manager = new PluginManager();

    const plugin: PluginInstance = {
      manifest: {
        id: 'failing-plugin',
        name: 'Failing Plugin',
        version: '1.0.0',
        description: 'Throws during activation',
        author: 'Tester',
      },
      enabled: false,
      onLoad: context => {
        context.registerCommand({ id: 'ghost-command', title: 'Ghost Command', handler: () => {} });
        context.addStatusBarItem({ id: 'ghost-item', text: 'Ghost' });
        throw new Error('activation failed');
      },
      onUnload: () => {},
    };

    manager.registerPlugin(plugin);
    const activated = await manager.activatePlugin('failing-plugin');

    expect(activated).toBe(false);
    expect(manager.getCommands()).toHaveLength(0);
    expect(manager.getStatusBarItems()).toHaveLength(0);
  });

  it('ignores duplicate registration of the same instance', async () => {
    const manager = new PluginManager();
    let loadCount = 0;

    const plugin: PluginInstance = {
      manifest: {
        id: 'strictmode-plugin',
        name: 'Strict Mode Plugin',
        version: '1.0.0',
        description: 'Registered twice during development',
        author: 'Tester',
      },
      enabled: true,
      onLoad: () => {
        loadCount += 1;
      },
      onUnload: () => {},
    };

    manager.registerPlugin(plugin);
    manager.registerPlugin(plugin);
    await Promise.resolve();

    expect(loadCount).toBe(1);
    expect(manager.getAllPlugins()).toHaveLength(1);
  });
});
