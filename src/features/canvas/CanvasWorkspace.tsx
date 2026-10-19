import React, { useState, useEffect, useRef } from 'react';
import { Note } from '../../core/domain/note';
import { CanvasDocument, CanvasElement, CanvasElementType, ConnectorStyle, ArrowHeadType } from '../../core/domain/canvas';
import { CanvasToolbar } from './CanvasToolbar';
import { CanvasShortcut, resolveCanvasShortcut } from '../../core/canvas/shortcuts';
import { 
  FileText, 
  Trash2, 
  ExternalLink, 
  ZoomIn, 
  ZoomOut, 
  Maximize2,
  Copy,
  Workflow,
  Spline,
  GitCommit,
  ArrowRight
} from 'lucide-react';

interface CanvasWorkspaceProps {
  canvasDoc: CanvasDocument;
  onUpdateCanvas: (updated: CanvasDocument) => void;
  notes: Note[];
  onOpenNote: (noteId: string) => void;
  isDarkMode: boolean;
}

// Computes optimal attachment points between two shapes
function getAutoConnectPoints(
  fromEl: CanvasElement, 
  toEl: CanvasElement
): { fromPoint: { x: number; y: number }; toPoint: { x: number; y: number } } {
  const centerA = { x: fromEl.x + fromEl.width / 2, y: fromEl.y + fromEl.height / 2 };
  const centerB = { x: toEl.x + toEl.width / 2, y: toEl.y + toEl.height / 2 };

  const dx = centerB.x - centerA.x;
  const dy = centerB.y - centerA.y;

  let fromPoint = { x: centerA.x, y: centerA.y };
  let toPoint = { x: centerB.x, y: centerB.y };

  if (Math.abs(dx) >= Math.abs(dy)) {
    if (dx > 0) {
      // B is to the right of A
      fromPoint = { x: fromEl.x + fromEl.width, y: centerA.y };
      toPoint = { x: toEl.x, y: centerB.y };
    } else {
      // B is to the left of A
      fromPoint = { x: fromEl.x, y: centerA.y };
      toPoint = { x: toEl.x + toEl.width, y: centerB.y };
    }
  } else {
    if (dy > 0) {
      // B is below A
      fromPoint = { x: centerA.x, y: fromEl.y + fromEl.height };
      toPoint = { x: centerB.x, y: toEl.y };
    } else {
      // B is above A
      fromPoint = { x: centerA.x, y: fromEl.y };
      toPoint = { x: centerB.x, y: toEl.y + toEl.height };
    }
  }

  return { fromPoint, toPoint };
}

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  canvasDoc,
  onUpdateCanvas,
  notes,
  onOpenNote,
  isDarkMode,
}) => {
  const [activeTool, setActiveTool] = useState<CanvasElementType | 'select'>('select');
  const [connectorStyle, setConnectorStyle] = useState<ConnectorStyle>('curved');
  const [arrowHeadType, setArrowHeadType] = useState<ArrowHeadType>('end');
  
  // Auto-connect flow state
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [isNoteSelectorOpen, setIsNoteSelectorOpen] = useState(false);

  // Undo / Redo history
  const [history, setHistory] = useState<CanvasElement[][]>([canvasDoc.elements]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState(canvasDoc.viewport || { x: 0, y: 0, zoom: 1 });

  // Dragging state
  const isDraggingCanvasRef = useRef(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedElementRef = useRef<{ 
    id: string; 
    initialX: number; 
    initialY: number; 
    mouseStartX: number; 
    mouseStartY: number 
  } | null>(null);

  const pushHistory = (newElements: CanvasElement[]) => {
    const nextHistory = history.slice(0, historyIndex + 1);
    nextHistory.push(newElements);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    onUpdateCanvas({ ...canvasDoc, elements: newElements });
  };

  const applyHistoryElements = (elements: CanvasElement[]) => {
    setSelectedElementId(prev =>
      prev && elements.some(el => el.id === prev) ? prev : null
    );
    setEditingElementId(null);
    onUpdateCanvas({ ...canvasDoc, elements });
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      applyHistoryElements(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      applyHistoryElements(next);
    }
  };

  const canvasIdRef = useRef(canvasDoc.id);

  // A different document means a different history. Without this, undo can
  // write the previously opened canvas into the active one.
  useEffect(() => {
    if (canvasIdRef.current === canvasDoc.id) return;

    canvasIdRef.current = canvasDoc.id;
    setHistory([canvasDoc.elements]);
    setHistoryIndex(0);
    setSelectedElementId(null);
    setEditingElementId(null);
    setIsNoteSelectorOpen(false);
    setPan(canvasDoc.viewport || { x: 0, y: 0, zoom: 1 });
  }, [canvasDoc]);

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.round((clientX - rect.left - pan.x) / pan.zoom),
      y: Math.round((clientY - rect.top - pan.y) / pan.zoom),
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    // If clicking background
    if ((e.target as HTMLElement).id === 'canvas-bg' || (e.target as HTMLElement).tagName === 'svg') {
      if (activeTool !== 'select' && activeTool !== 'connector') {
        const { x, y } = screenToCanvas(e.clientX, e.clientY);
        createElementAt(activeTool, x, y);
        setActiveTool('select');
      } else {
        setSelectedElementId(null);
        setEditingElementId(null);
        if (isAutoConnecting) {
          setIsAutoConnecting(false);
          setConnectSourceId(null);
        }
        isDraggingCanvasRef.current = true;
        dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      }
    }
  };

  const createElementAt = (
    type: CanvasElementType, 
    x: number, 
    y: number, 
    linkedNote?: Note
  ) => {
    const id = `el-${Date.now()}`;
    let newElement: CanvasElement;

    switch (type) {
      case 'rectangle':
        newElement = {
          id,
          type: 'rectangle',
          x,
          y,
          width: 160,
          height: 80,
          text: 'Process Step',
          color: isDarkMode ? '#1e293b' : '#ffffff',
          strokeColor: '#6366f1',
        };
        break;
      case 'diamond':
        newElement = {
          id,
          type: 'diamond',
          x,
          y,
          width: 120,
          height: 100,
          text: 'Decision?',
          color: '#8b5cf6',
        };
        break;
      case 'circle':
        newElement = {
          id,
          type: 'circle',
          x,
          y,
          width: 100,
          height: 100,
          text: 'State',
          color: '#06b6d4',
        };
        break;
      case 'cylinder':
        newElement = {
          id,
          type: 'cylinder',
          x,
          y,
          width: 130,
          height: 100,
          text: 'Database',
          color: isDarkMode ? '#1e293b' : '#f8fafc',
          strokeColor: '#3b82f6',
        };
        break;
      case 'cloud':
        newElement = {
          id,
          type: 'cloud',
          x,
          y,
          width: 160,
          height: 100,
          text: 'Cloud API',
          color: isDarkMode ? '#1e293b' : '#f8fafc',
          strokeColor: '#06b6d4',
        };
        break;
      case 'hexagon':
        newElement = {
          id,
          type: 'hexagon',
          x,
          y,
          width: 140,
          height: 90,
          text: 'Service',
          color: isDarkMode ? '#1e293b' : '#f8fafc',
          strokeColor: '#10b981',
        };
        break;
      case 'sticky':
        newElement = {
          id,
          type: 'sticky',
          x,
          y,
          width: 160,
          height: 140,
          text: 'Quick Note...',
          color: '#fef08a',
        };
        break;
      case 'text':
        newElement = {
          id,
          type: 'text',
          x,
          y,
          width: 140,
          height: 40,
          text: 'Heading Text',
          color: 'transparent',
        };
        break;
      case 'note-card':
        newElement = {
          id,
          type: 'note-card',
          x,
          y,
          width: 220,
          height: 110,
          linkedNoteId: linkedNote?.id,
          linkedNoteTitle: linkedNote?.title || 'Linked Note',
          text: linkedNote?.title || 'Linked Note Card',
          color: '#6366f1',
        };
        break;
      case 'connector':
        newElement = {
          id,
          type: 'connector',
          x,
          y,
          width: 100,
          height: 0,
          fromPoint: { x, y },
          toPoint: { x: x + 120, y: y + 60 },
          connectorStyle,
          arrowHeadType,
        };
        break;
      default:
        return;
    }

    pushHistory([...canvasDoc.elements, newElement]);
    setSelectedElementId(newElement.id);
  };

  const handleElementMouseDown = (e: React.MouseEvent, el: CanvasElement) => {
    e.stopPropagation();

    // Auto-Connect flow:
    if (isAutoConnecting || activeTool === 'connector') {
      if (!connectSourceId) {
        // Step 1: select source shape
        setConnectSourceId(el.id);
        setSelectedElementId(el.id);
      } else if (connectSourceId !== el.id) {
        // Step 2: select target shape and connect them!
        const sourceEl = canvasDoc.elements.find(item => item.id === connectSourceId);
        if (sourceEl) {
          const { fromPoint, toPoint } = getAutoConnectPoints(sourceEl, el);
          const newConnector: CanvasElement = {
            id: `connector-${Date.now()}`,
            type: 'connector',
            x: Math.min(fromPoint.x, toPoint.x),
            y: Math.min(fromPoint.y, toPoint.y),
            width: Math.abs(toPoint.x - fromPoint.x),
            height: Math.abs(toPoint.y - fromPoint.y),
            fromId: sourceEl.id,
            toId: el.id,
            fromPoint,
            toPoint,
            connectorStyle,
            arrowHeadType,
            color: '#6366f1',
          };
          pushHistory([...canvasDoc.elements, newConnector]);
        }
        setIsAutoConnecting(false);
        setConnectSourceId(null);
        setActiveTool('select');
      }
      return;
    }

    setSelectedElementId(el.id);

    draggedElementRef.current = {
      id: el.id,
      initialX: el.x,
      initialY: el.y,
      mouseStartX: e.clientX,
      mouseStartY: e.clientY,
    };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingCanvasRef.current) {
      setPan(prev => ({
        ...prev,
        x: e.clientX - dragStartRef.current.x,
        y: e.clientY - dragStartRef.current.y,
      }));
    } else if (draggedElementRef.current) {
      const deltaX = (e.clientX - draggedElementRef.current.mouseStartX) / pan.zoom;
      const deltaY = (e.clientY - draggedElementRef.current.mouseStartY) / pan.zoom;

      // 1. Move the dragged shape
      const nextElements = canvasDoc.elements.map(el => {
        if (el.id === draggedElementRef.current?.id) {
          return {
            ...el,
            x: Math.round(draggedElementRef.current.initialX + deltaX),
            y: Math.round(draggedElementRef.current.initialY + deltaY),
          };
        }
        return el;
      });

      // 2. Real-time Auto-Connect: dynamically update attached connectors!
      const elMap = new Map(nextElements.map(item => [item.id, item]));
      const updatedElements = nextElements.map(el => {
        if (el.type === 'connector' && el.fromId && el.toId) {
          const source = elMap.get(el.fromId);
          const target = elMap.get(el.toId);
          if (source && target) {
            const { fromPoint, toPoint } = getAutoConnectPoints(source, target);
            return {
              ...el,
              fromPoint,
              toPoint,
            };
          }
        }
        return el;
      });

      onUpdateCanvas({ ...canvasDoc, elements: updatedElements });
    }
  };

  const handleMouseUp = () => {
    if (isDraggingCanvasRef.current) {
      isDraggingCanvasRef.current = false;
      onUpdateCanvas({ ...canvasDoc, viewport: pan });
    }

    if (draggedElementRef.current) {
      const drag = draggedElementRef.current;
      draggedElementRef.current = null;

      // Selecting a shape also sets the drag ref. Only record history when the
      // element actually moved, otherwise a plain click adds a duplicate step.
      const moved = canvasDoc.elements.some(
        el => el.id === drag.id && (el.x !== drag.initialX || el.y !== drag.initialY)
      );

      if (moved) pushHistory(canvasDoc.elements);
    }
  };

  const handleDeleteSelected = () => {
    if (!selectedElementId) return;
    const nextElements = canvasDoc.elements.filter(el => {
      // If deleting a shape, also delete connectors attached to it
      if (el.id === selectedElementId) return false;
      if (el.type === 'connector' && (el.fromId === selectedElementId || el.toId === selectedElementId)) {
        return false;
      }
      return true;
    });
    pushHistory(nextElements);
    setSelectedElementId(null);
  };

  const handleDuplicateSelected = () => {
    const target = canvasDoc.elements.find(el => el.id === selectedElementId);
    if (!target) return;
    const clone: CanvasElement = {
      ...target,
      id: `el-${Date.now()}`,
      x: target.x + 30,
      y: target.y + 30,
    };
    pushHistory([...canvasDoc.elements, clone]);
    setSelectedElementId(clone.id);
  };

  // The keydown listener is registered once, so it dispatches through a ref to
  // always reach the handlers from the latest render.
  const shortcutActionsRef = useRef<(shortcut: CanvasShortcut) => void>(() => {});

  useEffect(() => {
    shortcutActionsRef.current = shortcut => {
      switch (shortcut) {
        case 'undo':
          handleUndo();
          break;
        case 'redo':
          handleRedo();
          break;
        case 'delete':
          handleDeleteSelected();
          break;
        case 'duplicate':
          handleDuplicateSelected();
          break;
        case 'cancel':
          setIsAutoConnecting(false);
          setConnectSourceId(null);
          setEditingElementId(null);
          setSelectedElementId(null);
          setActiveTool('select');
          break;
      }
    };
  });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      const isEditable = Boolean(
        target &&
          (tag === 'INPUT' ||
            tag === 'TEXTAREA' ||
            tag === 'SELECT' ||
            target.isContentEditable)
      );

      const shortcut = resolveCanvasShortcut(event, isEditable);
      if (!shortcut) return;

      event.preventDefault();
      shortcutActionsRef.current(shortcut);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleChangeElementColor = (id: string, color: string) => {
    const next = canvasDoc.elements.map(el => (el.id === id ? { ...el, color } : el));
    pushHistory(next);
  };

  const handleChangeConnectorStyle = (id: string, style: ConnectorStyle) => {
    const next = canvasDoc.elements.map(el => (el.id === id ? { ...el, connectorStyle: style } : el));
    pushHistory(next);
  };

  const handleChangeArrowHeadType = (id: string, head: ArrowHeadType) => {
    const next = canvasDoc.elements.map(el => (el.id === id ? { ...el, arrowHeadType: head } : el));
    pushHistory(next);
  };

  const handleExportSvg = () => {
    const svgEl = document.getElementById('notemesh-canvas-svg');
    if (!svgEl) return;
    const xml = new XMLSerializer().serializeToString(svgEl);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${canvasDoc.title || 'diagram'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const selectedElement = canvasDoc.elements.find(el => el.id === selectedElementId);

  return (
    <div
      ref={containerRef}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className="relative w-full h-[calc(100vh-5.5rem)] bg-background overflow-hidden select-none font-sans"
    >
      {/* Top Toolbar with Multiple Shapes and Arrow Options */}
      <CanvasToolbar
        activeTool={activeTool}
        setActiveTool={setActiveTool}
        connectorStyle={connectorStyle}
        setConnectorStyle={setConnectorStyle}
        arrowHeadType={arrowHeadType}
        setArrowHeadType={setArrowHeadType}
        isAutoConnecting={isAutoConnecting}
        onToggleAutoConnect={() => {
          setIsAutoConnecting(!isAutoConnecting);
          setConnectSourceId(null);
        }}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        gridEnabled={canvasDoc.gridEnabled}
        onToggleGrid={() => onUpdateCanvas({ ...canvasDoc, gridEnabled: !canvasDoc.gridEnabled })}
        onAddLinkedNoteCard={() => setIsNoteSelectorOpen(true)}
        onExportSvg={handleExportSvg}
      />

      {/* Auto-Connect Prompt Banner */}
      {isAutoConnecting && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-xl text-xs font-semibold flex items-center space-x-2 animate-bounce">
          <Workflow className="w-4 h-4" />
          <span>
            {connectSourceId 
              ? 'Click target shape to complete connection' 
              : 'Click first shape to start connector'}
          </span>
        </div>
      )}

      {/* Selected Element Quick Palette */}
      {selectedElement && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 flex items-center bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md border border-border dark:border-slate-800 px-3.5 py-1.5 rounded-xl shadow-xl space-x-2 text-xs">
          {selectedElement.type === 'connector' ? (
            /* Connector Specific Options */
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold">Arrow:</span>
              <button
                onClick={() => handleChangeConnectorStyle(selectedElement.id, 'curved')}
                title="Curved Flow"
                className={`p-1 rounded ${selectedElement.connectorStyle === 'curved' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <Spline className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleChangeConnectorStyle(selectedElement.id, 'orthogonal')}
                title="90° Step Orthogonal"
                className={`p-1 rounded ${selectedElement.connectorStyle === 'orthogonal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <GitCommit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleChangeConnectorStyle(selectedElement.id, 'straight')}
                title="Straight Arrow"
                className={`p-1 rounded ${selectedElement.connectorStyle === 'straight' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleChangeArrowHeadType(
                  selectedElement.id, 
                  selectedElement.arrowHeadType === 'both' ? 'end' : 'both'
                )}
                title="Toggle Bidirectional Arrow"
                className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
                  selectedElement.arrowHeadType === 'both' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                &lt;-&gt;
              </button>
            </div>
          ) : (
            /* Shape Specific Options */
            <>
              <button
                onClick={() => {
                  setIsAutoConnecting(true);
                  setConnectSourceId(selectedElement.id);
                }}
                className="flex items-center space-x-1 px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-semibold"
                title="Connect arrow from this shape to another"
              >
                <Workflow className="w-3.5 h-3.5" />
                <span>Connect To...</span>
              </button>
              <div className="h-4 w-[1px] bg-slate-800 mx-1" />
              <span className="text-slate-400 font-bold">Color:</span>
              {['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#fef08a', '#1e293b'].map(c => (
                <button
                  key={c}
                  onClick={() => handleChangeElementColor(selectedElement.id, c)}
                  className="w-4 h-4 rounded-full border border-black/20 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c }}
                />
              ))}
            </>
          )}

          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <button
            onClick={handleDuplicateSelected}
            className="text-slate-300 hover:text-indigo-400 flex items-center space-x-1"
            title="Duplicate (Ctrl+D)"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Duplicate</span>
          </button>
          <div className="h-4 w-[1px] bg-slate-800 mx-1" />
          <button
            onClick={handleDeleteSelected}
            className="text-rose-400 hover:text-rose-500 flex items-center space-x-1"
            title="Delete (Del)"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Delete</span>
          </button>
        </div>
      )}

      {/* Linked Note Picker Modal */}
      {isNoteSelectorOpen && (
        <div className="absolute inset-0 z-30 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface dark:bg-[#111827] border border-border dark:border-slate-800 rounded-2xl p-5 w-96 shadow-2xl space-y-3">
            <h3 className="font-bold text-base text-slate-100">Select Note to Embed as Card</h3>
            <p className="text-xs text-slate-400">
              This card will display the note preview and connect to it interactively.
            </p>
            <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
              {notes.map(note => (
                <div
                  key={note.id}
                  onClick={() => {
                    createElementAt('note-card', 200, 200, note);
                    setIsNoteSelectorOpen(false);
                  }}
                  className="flex items-center space-x-2.5 p-2.5 rounded-xl hover:bg-slate-800 cursor-pointer text-xs font-semibold text-slate-200"
                >
                  <FileText className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="truncate">{note.title}</span>
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-3 border-t border-slate-800">
              <button
                onClick={() => setIsNoteSelectorOpen(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-400 hover:text-white"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SVG Canvas Board */}
      <svg
        id="notemesh-canvas-svg"
        className="w-full h-full cursor-crosshair"
      >
        <defs>
          {/* Grid pattern */}
          {canvasDoc.gridEnabled && (
            <pattern
              id="grid-pattern"
              width="24"
              height="24"
              patternUnits="userSpaceOnUse"
            >
              <circle
                cx="12"
                cy="12"
                r="1"
                fill={isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
              />
            </pattern>
          )}

          {/* Forward Arrow marker */}
          <marker
            id="arrowhead"
            markerWidth="10"
            markerHeight="7"
            refX="9"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="0 0, 10 3.5, 0 7"
              fill={isDarkMode ? '#818cf8' : '#6366f1'}
            />
          </marker>

          {/* Reverse Arrow marker for Bidirectional Arrows */}
          <marker
            id="arrowhead-start"
            markerWidth="10"
            markerHeight="7"
            refX="1"
            refY="3.5"
            orient="auto"
          >
            <polygon
              points="10 0, 0 3.5, 10 7"
              fill={isDarkMode ? '#818cf8' : '#6366f1'}
            />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect
          id="canvas-bg"
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={canvasDoc.gridEnabled ? 'url(#grid-pattern)' : 'transparent'}
        />

        {/* Pan and Zoom Layer */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${pan.zoom})`}>
          {/* Connectors / Arrows */}
          {canvasDoc.elements
            .filter(el => el.type === 'connector')
            .map(el => {
              const x1 = el.fromPoint?.x || el.x;
              const y1 = el.fromPoint?.y || el.y;
              const x2 = el.toPoint?.x || el.x + 100;
              const y2 = el.toPoint?.y || el.y + 50;

              const style = el.connectorStyle || 'curved';
              let pathD = '';

              if (style === 'straight') {
                pathD = `M ${x1} ${y1} L ${x2} ${y2}`;
              } else if (style === 'orthogonal') {
                const midX = (x1 + x2) / 2;
                pathD = `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}`;
              } else {
                // Curved Bezier
                const midX = (x1 + x2) / 2;
                pathD = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
              }

              const isSelected = selectedElementId === el.id;
              const hasStartArrow = el.arrowHeadType === 'both';

              return (
                <g key={el.id} onMouseDown={e => handleElementMouseDown(e, el)} className="cursor-pointer">
                  {/* Invisible wider hit-area */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke="transparent"
                    strokeWidth="14"
                  />
                  {/* Visual Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#6366f1' : (isDarkMode ? '#818cf8' : '#4f46e5')}
                    strokeWidth={isSelected ? '2.5' : '2'}
                    strokeDasharray={style === 'dashed' ? '6,4' : undefined}
                    markerStart={hasStartArrow ? 'url(#arrowhead-start)' : undefined}
                    markerEnd="url(#arrowhead)"
                  />
                </g>
              );
            })}

          {/* Shapes & Note Cards */}
          {canvasDoc.elements
            .filter(el => el.type !== 'connector')
            .map(el => {
              const isSelected = selectedElementId === el.id;
              const isConnectSource = connectSourceId === el.id;

              return (
                <g
                  key={el.id}
                  transform={`translate(${el.x}, ${el.y})`}
                  onMouseDown={e => handleElementMouseDown(e, el)}
                  className="cursor-move group"
                >
                  {/* Active Auto-Connect glowing halo */}
                  {isConnectSource && (
                    <rect
                      x="-6"
                      y="-6"
                      width={el.width + 12}
                      height={el.height + 12}
                      rx="14"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="3"
                      strokeDasharray="6,4"
                      className="animate-pulse"
                    />
                  )}

                  {/* Rectangle */}
                  {el.type === 'rectangle' && (
                    <rect
                      width={el.width}
                      height={el.height}
                      rx="10"
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : (el.strokeColor || '#475569')}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                  )}

                  {/* Diamond */}
                  {el.type === 'diamond' && (
                    <polygon
                      points={`${el.width / 2},0 ${el.width},${el.height / 2} ${el.width / 2},${el.height} 0,${el.height / 2}`}
                      fill={el.color || '#8b5cf6'}
                      stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.15)'}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                  )}

                  {/* Circle */}
                  {el.type === 'circle' && (
                    <ellipse
                      cx={el.width / 2}
                      cy={el.height / 2}
                      rx={el.width / 2}
                      ry={el.height / 2}
                      fill={el.color || '#06b6d4'}
                      stroke={isSelected ? '#ffffff' : 'rgba(0,0,0,0.15)'}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                  )}

                  {/* Cylinder (Database) */}
                  {el.type === 'cylinder' && (
                    <g>
                      <path
                        d={`M 0 16 L 0 ${el.height - 16} A ${el.width / 2} 16 0 0 0 ${el.width} ${el.height - 16} L ${el.width} 16 Z`}
                        fill={el.color || '#1e293b'}
                        stroke={isSelected ? '#6366f1' : (el.strokeColor || '#475569')}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />
                      <ellipse
                        cx={el.width / 2}
                        cy={16}
                        rx={el.width / 2}
                        ry={14}
                        fill={el.color || '#1e293b'}
                        stroke={isSelected ? '#6366f1' : (el.strokeColor || '#475569')}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />
                    </g>
                  )}

                  {/* Cloud */}
                  {el.type === 'cloud' && (
                    <path
                      d={`M 20 45 A 20 20 0 0 1 50 20 A 30 30 0 0 1 110 20 A 25 25 0 0 1 145 45 A 20 20 0 0 1 135 80 L 25 80 A 20 20 0 0 1 20 45 Z`}
                      transform={`scale(${el.width / 160}, ${el.height / 95})`}
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : (el.strokeColor || '#06b6d4')}
                      strokeWidth={isSelected ? '3' : '2'}
                    />
                  )}

                  {/* Hexagon */}
                  {el.type === 'hexagon' && (
                    <polygon
                      points={`${el.width * 0.25},0 ${el.width * 0.75},0 ${el.width},${el.height * 0.5} ${el.width * 0.75},${el.height} ${el.width * 0.25},${el.height} 0,${el.height * 0.5}`}
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : (el.strokeColor || '#10b981')}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                  )}

                  {/* Sticky Note */}
                  {el.type === 'sticky' && (
                    <g>
                      <rect
                        width={el.width}
                        height={el.height}
                        rx="4"
                        fill={el.color || '#fef08a'}
                        stroke={isSelected ? '#6366f1' : 'rgba(0,0,0,0.1)'}
                        strokeWidth={isSelected ? '2' : '1'}
                      />
                    </g>
                  )}

                  {/* Linked Note Card */}
                  {el.type === 'note-card' && (
                    <g>
                      <rect
                        width={el.width}
                        height={el.height}
                        rx="12"
                        fill={isDarkMode ? '#0d121f' : '#ffffff'}
                        stroke={isSelected ? '#6366f1' : '#6366f1'}
                        strokeWidth="2"
                        filter="drop-shadow(0 4px 14px rgba(99, 102, 241, 0.2))"
                      />
                      <rect
                        width={el.width}
                        height="28"
                        rx="10"
                        fill="#6366f1"
                      />
                      <text
                        x="12"
                        y="18"
                        fill="#ffffff"
                        fontSize="12"
                        fontWeight="700"
                        fontFamily="Poppins, sans-serif"
                      >
                        {el.linkedNoteTitle || 'Note'}
                      </text>
                    </g>
                  )}

                  {/* Editable Text / ForeignObject */}
                  <foreignObject
                    x={el.type === 'note-card' ? '12' : '8'}
                    y={el.type === 'note-card' ? '34' : '8'}
                    width={el.width - 16}
                    height={el.height - (el.type === 'note-card' ? 42 : 16)}
                  >
                    <div
                      onDoubleClick={() => setEditingElementId(el.id)}
                      className="w-full h-full flex flex-col justify-center items-center text-center p-1 select-text"
                    >
                      {editingElementId === el.id ? (
                        <textarea
                          autoFocus
                          value={el.text || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const next = canvasDoc.elements.map(item =>
                              item.id === el.id ? { ...item, text: val } : item
                            );
                            onUpdateCanvas({ ...canvasDoc, elements: next });
                          }}
                          onBlur={() => {
                            setEditingElementId(null);
                            pushHistory(canvasDoc.elements);
                          }}
                          className="w-full h-full bg-transparent resize-none border-none focus:outline-none text-xs font-semibold text-center text-slate-100"
                        />
                      ) : (
                        <span className={`text-xs font-bold leading-tight line-clamp-3 ${
                          el.type === 'sticky' ? 'text-amber-950 font-medium' : 'text-slate-100'
                        }`}>
                          {el.text || 'Type here...'}
                        </span>
                      )}

                      {/* Jump to note button on Note Card */}
                      {el.type === 'note-card' && el.linkedNoteId && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onOpenNote(el.linkedNoteId!);
                          }}
                          className="mt-2 flex items-center space-x-1 px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-md text-xs font-bold transition-all shadow-sm"
                          title="Open full note in editor"
                        >
                          <span>Open Note</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </foreignObject>
                </g>
              );
            })}
        </g>
      </svg>

      {/* Bottom Zoom Controls */}
      <div className="absolute bottom-6 left-6 z-10 flex items-center space-x-1.5 bg-surface/90 dark:bg-slate-900/90 backdrop-blur-md border border-border dark:border-slate-800 p-1.5 rounded-xl shadow-xl text-slate-400">
        <button
          onClick={() => setPan(p => ({ ...p, zoom: Math.min(2.5, p.zoom * 1.2) }))}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPan(p => ({ ...p, zoom: Math.max(0.3, p.zoom / 1.2) }))}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => setPan({ x: 50, y: 50, zoom: 1 })}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Recenter"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-semibold px-2 text-slate-300">{Math.round(pan.zoom * 100)}%</span>
      </div>
    </div>
  );
};
