import React from 'react';
import { GraphFilterConfig } from '../../core/domain/graph';
import { Sliders, Filter, Sparkles, RefreshCw, Palette, Search } from 'lucide-react';

interface GraphControlsProps {
  config: GraphFilterConfig;
  onChangeConfig: (newConfig: GraphFilterConfig) => void;
  onResetSimulation: () => void;
  availableTags: string[];
}

export const GraphControls: React.FC<GraphControlsProps> = ({
  config,
  onChangeConfig,
  onResetSimulation,
  availableTags,
}) => {
  return (
    <div className="absolute top-4 right-4 z-10 w-72 bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md border border-border dark:border-slate-800 rounded-2xl p-4 shadow-2xl select-none text-xs space-y-3.5">
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 border-b border-border dark:border-slate-800">
        <div className="flex items-center space-x-2 font-bold text-sm text-slate-800 dark:text-slate-100">
          <Sliders className="w-4 h-4 text-indigo-400" />
          <span>Graph Settings</span>
        </div>
        <button
          onClick={onResetSimulation}
          title="Reheat Simulation"
          className="p-1.5 hover:bg-surface-hover dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Real-time search inside graph */}
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          placeholder="Search in graph..."
          value={config.searchFilter}
          onChange={e => onChangeConfig({ ...config, searchFilter: e.target.value })}
          className="w-full pl-8 pr-2.5 py-1.5 text-xs rounded-xl bg-surface-hover/70 dark:bg-slate-800/60 border border-border dark:border-slate-700/60 focus:outline-none focus:border-indigo-500 text-slate-800 dark:text-slate-200"
        />
      </div>

      {/* Color Mode Selector */}
      <div>
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
          <Palette className="w-3.5 h-3.5 text-indigo-400" />
          <span>Color Scheme</span>
        </div>
        <select
          value={config.colorMode}
          onChange={e => onChangeConfig({ ...config, colorMode: e.target.value as 'type' | 'folder' | 'tag' })}
          className="w-full text-xs font-semibold bg-surface-hover/70 dark:bg-slate-800/60 border border-border dark:border-slate-700/60 rounded-xl p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
        >
          <option value="type">Color by Node Type</option>
          <option value="folder">Color by Folder</option>
          <option value="tag">Color by Tag</option>
        </select>
      </div>

      {/* Filters */}
      <div className="space-y-2.5 pt-2 border-t border-border dark:border-slate-800">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-cyan-400" />
          <span>Visibility</span>
        </div>

        <label className="flex items-center justify-between cursor-pointer py-0.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show Orphans</span>
          <input
            type="checkbox"
            checked={config.showOrphans}
            onChange={e => onChangeConfig({ ...config, showOrphans: e.target.checked })}
            className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer py-0.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show Missing Links</span>
          <input
            type="checkbox"
            checked={config.showMissingLinks}
            onChange={e => onChangeConfig({ ...config, showMissingLinks: e.target.checked })}
            className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        <label className="flex items-center justify-between cursor-pointer py-0.5">
          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">Show Tag Nodes</span>
          <input
            type="checkbox"
            checked={config.showTags}
            onChange={e => onChangeConfig({ ...config, showTags: e.target.checked })}
            className="w-4 h-4 rounded border-border text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        {availableTags.length > 0 && (
          <div className="pt-1">
            <label className="block text-slate-400 text-xs uppercase font-bold mb-1.5">
              Filter by Tag
            </label>
            <select
              value={config.tagFilter || ''}
              onChange={e => onChangeConfig({ ...config, tagFilter: e.target.value || null })}
              className="w-full text-xs font-semibold bg-surface-hover/70 dark:bg-slate-800/60 border border-border dark:border-slate-700/60 rounded-xl p-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:border-indigo-500"
            >
              <option value="">All Tags</option>
              {availableTags.map(tag => (
                <option key={tag} value={tag}>#{tag}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Physical Forces Sliders */}
      <div className="space-y-2.5 pt-2 border-t border-border dark:border-slate-800">
        <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
          <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
          <span>Forces</span>
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
            <span>Repel Force</span>
            <span className="font-mono text-slate-300">{config.repelForce}</span>
          </div>
          <input
            type="range"
            min="100"
            max="1200"
            step="50"
            value={config.repelForce}
            onChange={e => onChangeConfig({ ...config, repelForce: Number(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
            <span>Link Distance</span>
            <span className="font-mono text-slate-300">{config.linkDistance}px</span>
          </div>
          <input
            type="range"
            min="40"
            max="250"
            step="10"
            value={config.linkDistance}
            onChange={e => onChangeConfig({ ...config, linkDistance: Number(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        <div>
          <div className="flex justify-between text-xs font-semibold text-slate-400 mb-1">
            <span>Collision Radius</span>
            <span className="font-mono text-slate-300">{config.collisionRadius}px</span>
          </div>
          <input
            type="range"
            min="10"
            max="60"
            step="5"
            value={config.collisionRadius}
            onChange={e => onChangeConfig({ ...config, collisionRadius: Number(e.target.value) })}
            className="w-full accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
};
