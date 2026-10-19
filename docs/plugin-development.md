# Plugin Development Guide

Welcome to the NoteMesh Plugin Developer Guide. NoteMesh is designed to be extensible from day one without turning the core codebase into a monolith.

---

## Plugin Anatomy

Every NoteMesh plugin consists of:
1. **Manifest**: Metadata declaring identity, version, and requested permissions.
2. **Lifecycle Hooks**:
   - `onLoad(context)`: Called when the plugin is enabled.
   - `onUnload()`: Called when the plugin is disabled or uninstalled.

---

## Step-by-Step: Writing a Plugin

### 1. Declare the Plugin Manifest
```typescript
import { PluginInstance } from '../domain/plugin';

export const MyCustomPlugin: PluginInstance = {
  manifest: {
    id: 'notemesh-plugin-pomodoro',
    name: 'Pomodoro Timer',
    version: '1.0.0',
    description: 'Adds a 25-minute focus timer to the status bar.',
    author: 'Your Name',
    permissions: ['statusbar', 'commands'],
  },
  enabled: true,

  onLoad: (context) => {
    // 1. Add Status Bar Item
    context.addStatusBarItem({
      id: 'pomodoro-timer',
      text: 'Focus: 25:00',
      tooltip: 'Click to start timer',
      onClick: () => {
        alert('Timer started.');
      },
    });

    // 2. Register Command Palette Command
    context.registerCommand({
      id: 'reset-pomodoro',
      title: 'Pomodoro: Reset Timer',
      handler: () => {
        context.updateStatusBarItem('pomodoro-timer', 'Focus: 25:00');
      },
    });
  },

  onUnload: () => {
    console.info('Pomodoro plugin unloaded');
  },
};
```

---

## Extension Points Available

| Extension Point | Capability |
| :--- | :--- |
| `context.registerCommand(options)` | Injects custom actions into the `Ctrl+K` Command Palette |
| `context.addStatusBarItem(item)` | Renders status indicators in the bottom application bar |
| `context.updateStatusBarItem(id, text)` | Updates status text dynamically |
| `context.getCurrentNoteContent()` | Reads the currently active note Markdown string |
| `context.onNoteChange(callback)` | Listens for live typing and note updates. Returns an unsubscribe function; the manager also releases listeners automatically when the plugin is disabled |

---

## Submitting Your Plugin

To submit your plugin to NoteMesh:
1. Fork the repository.
2. Add your plugin under `src/core/plugins/` or submit a proposal in GitHub Issues using the `Plugin Proposal` template.
3. Open a Pull Request!
