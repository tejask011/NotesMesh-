import React from 'react';
import { CanvasElementType, ConnectorStyle, ArrowHeadType } from '../../core/domain/canvas';
import {
  MousePointer,
  Square,
  Diamond,
  Circle,
  Database,
  Cloud,
  Hexagon,
  StickyNote,
  Type,
  ArrowRight,
  FileText,
  RotateCcw,
  RotateCw,
  Grid,
  BoxSelect,
  Spline,
  GitCommit,
  Workflow,
} from 'lucide-react';

export type CanvasTool = CanvasElementType | 'select' | 'marquee';

interface CanvasToolbarProps {
  activeTool: CanvasTool;
  setActiveTool: (tool: CanvasTool) => void;
  connectorStyle: ConnectorStyle;
  setConnectorStyle: (style: ConnectorStyle) => void;
  arrowHeadType: ArrowHeadType;
  setArrowHeadType: (head: ArrowHeadType) => void;
  isAutoConnecting: boolean;
  onToggleAutoConnect: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  gridEnabled: boolean;
  onToggleGrid: () => void;
  onAddLinkedNoteCard: () => void;
}

export const CanvasToolbar: React.FC<CanvasToolbarProps> = ({
  activeTool,
  setActiveTool,
  connectorStyle,
  setConnectorStyle,
  arrowHeadType,
  setArrowHeadType,
  isAutoConnecting,
  onToggleAutoConnect,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  gridEnabled,
  onToggleGrid,
  onAddLinkedNoteCard,
}) => {
  return (
    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center max-w-[calc(100%-1rem)] overflow-x-auto bg-surface/95 dark:bg-[#0c101d]/95 backdrop-blur-xl border border-border dark:border-slate-800 px-3.5 py-2 rounded-2xl shadow-2xl select-none space-x-1.5 font-sans">
      {/* Select tool */}
      <button
        onClick={() => {
          setActiveTool('select');
        }}
        title="Select & Move (V)"
        className={`p-2 shrink-0 rounded-xl transition-all ${
          activeTool === 'select' && !isAutoConnecting
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <MousePointer className="w-4 h-4" />
      </button>

      {/* Box select: Shift+drag with a mouse, and how touch screens multi-select */}
      <button
        onClick={() => setActiveTool('marquee')}
        title="Box Select: drag to select several, tap shapes to add or remove (or Shift+drag)"
        className={`p-2 shrink-0 rounded-xl transition-all ${
          activeTool === 'marquee'
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
            : 'text-slate-400 hover:bg-slate-800 hover:text-white'
        }`}
      >
        <BoxSelect className="w-4 h-4" />
      </button>

      {/* Auto Connect Tool */}
      <button
        onClick={onToggleAutoConnect}
        title="Auto Connect: Click source shape then target shape to connect!"
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
          isAutoConnecting
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/40 ring-2 ring-indigo-400'
            : 'bg-indigo-500/10 border border-indigo-500/25 text-indigo-400 hover:bg-indigo-500/20'
        }`}
      >
        <Workflow className="w-4 h-4" />
        <span className="whitespace-nowrap">
          {isAutoConnecting ? 'Connecting...' : 'Auto-Connect'}
        </span>
      </button>

      <div className="h-6 w-[1px] bg-border dark:bg-slate-800 mx-1" />

      {/* Shapes Group */}
      <div className="flex items-center space-x-1">
        <button
          onClick={() => setActiveTool('rectangle')}
          title="Process Box (Rectangle)"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'rectangle'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Square className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('diamond')}
          title="Decision Diamond"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'diamond'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Diamond className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('circle')}
          title="State / Circle Node"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'circle'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Circle className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('cylinder')}
          title="Database / Storage Cylinder"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'cylinder'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Database className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('cloud')}
          title="Cloud Service"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'cloud'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Cloud className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('hexagon')}
          title="Microservice / Hexagon"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'hexagon'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Hexagon className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('sticky')}
          title="Sticky Note"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'sticky'
              ? 'bg-amber-500 text-white shadow-md shadow-amber-500/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <StickyNote className="w-4 h-4" />
        </button>

        <button
          onClick={() => setActiveTool('text')}
          title="Text Block"
          className={`p-2 shrink-0 rounded-xl transition-all ${
            activeTool === 'text'
              ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
              : 'text-slate-400 hover:bg-slate-800 hover:text-white'
          }`}
        >
          <Type className="w-4 h-4" />
        </button>

        {/* Note Card */}
        <button
          onClick={onAddLinkedNoteCard}
          title="Embed Linked Note Card"
          className="flex items-center space-x-1 px-2.5 py-1.5 rounded-xl bg-slate-800 text-indigo-300 border border-slate-700 hover:bg-slate-700 text-xs font-semibold transition-colors"
        >
          <FileText className="w-3.5 h-3.5 text-indigo-400" />
          <span className="whitespace-nowrap">Note Card</span>
        </button>
      </div>

      <div className="h-6 w-[1px] bg-border dark:bg-slate-800 mx-1" />

      {/* Arrow Style Selector */}
      <div className="flex items-center shrink-0 space-x-1 bg-slate-900/80 p-1 rounded-xl border border-slate-800">
        <button
          onClick={() => {
            setActiveTool('connector');
            setConnectorStyle('curved');
          }}
          title="Curved Flow Arrow"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            activeTool === 'connector' && connectorStyle === 'curved'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Spline className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            setActiveTool('connector');
            setConnectorStyle('orthogonal');
          }}
          title="Orthogonal / 90° Step Arrow"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            activeTool === 'connector' && connectorStyle === 'orthogonal'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <GitCommit className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            setActiveTool('connector');
            setConnectorStyle('straight');
          }}
          title="Straight Arrow"
          className={`p-1.5 rounded-lg text-xs transition-colors ${
            activeTool === 'connector' && connectorStyle === 'straight'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={() => {
            setArrowHeadType(arrowHeadType === 'both' ? 'end' : 'both');
          }}
          title={
            arrowHeadType === 'both'
              ? 'Bidirectional <--> Arrow Active'
              : 'Switch to Bidirectional <--> Arrow'
          }
          className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold whitespace-nowrap transition-colors ${
            arrowHeadType === 'both'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          &lt;-&gt;
        </button>
      </div>

      <div className="h-6 w-[1px] bg-border dark:bg-slate-800 mx-1" />

      {/* Grid toggle */}
      <button
        onClick={onToggleGrid}
        title={gridEnabled ? 'Disable Grid' : 'Enable Grid'}
        className={`p-2 shrink-0 rounded-xl transition-all ${
          gridEnabled ? 'text-indigo-400 bg-indigo-500/10' : 'text-slate-400'
        } hover:bg-slate-800`}
      >
        <Grid className="w-4 h-4" />
      </button>

      {/* Undo / Redo */}
      <button
        onClick={onUndo}
        disabled={!canUndo}
        title="Undo (Ctrl+Z)"
        className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
      >
        <RotateCcw className="w-4 h-4" />
      </button>

      <button
        onClick={onRedo}
        disabled={!canRedo}
        title="Redo (Ctrl+Y)"
        className="p-2 rounded-xl text-slate-400 hover:bg-slate-800 disabled:opacity-25 disabled:hover:bg-transparent transition-colors"
      >
        <RotateCw className="w-4 h-4" />
      </button>
    </div>
  );
};
