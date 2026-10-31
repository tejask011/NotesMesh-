import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Note } from '../../core/domain/note';
import {
  CanvasDocument,
  CanvasElement,
  CanvasElementType,
  ConnectorStyle,
  ArrowHeadType,
} from '../../core/domain/canvas';
import {
  CLOUD_PATH,
  cloudScale,
  connectorPath,
  cylinderBodyPath,
  diamondPoints,
  duplicateElements,
  elementsInRect,
  getAutoConnectPoints,
  hexagonPoints,
  moveElements,
  readableTextColor,
  rectFromPoints,
  removeElements,
} from '../../core/canvas/canvasOps';
import { canvasExportSize, canvasToSvg, svgToPngBlob } from '../../core/canvas/canvasExport';
import { isEditableTarget } from '../../core/shortcuts';
import { createId } from '../../core/util/ids';
import { downloadBlob, downloadText, safeFileName } from '../../core/util/files';
import { CanvasTool, CanvasToolbar } from './CanvasToolbar';
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
  ArrowRight,
} from 'lucide-react';

interface CanvasWorkspaceProps {
  canvasDoc: CanvasDocument;
  onUpdateCanvas: (updated: CanvasDocument) => void;
  notes: Note[];
  onOpenNote: (noteId: string) => void;
  isDarkMode: boolean;
  onExportError: (message: string) => void;
}

const MIN_ZOOM = 0.3;
const MAX_ZOOM = 2.5;
const MAX_HISTORY = 100;
const TAP_SLOP_PX = 5;
const DOUBLE_TAP_MS = 350;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

type Gesture =
  | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
  | {
      kind: 'move';
      elementId: string;
      ids: Set<string>;
      base: CanvasElement[];
      /** The most recent position. Read this, not props: a render may not have caught up yet. */
      latest: CanvasElement[];
      startX: number;
      startY: number;
      moved: boolean;
    }
  | {
      kind: 'marquee';
      start: { x: number; y: number };
      current: { x: number; y: number };
      base: Set<string>;
    }
  | { kind: 'pinch'; distance: number; zoom: number };

export const CanvasWorkspace: React.FC<CanvasWorkspaceProps> = ({
  canvasDoc,
  onUpdateCanvas,
  notes,
  onOpenNote,
  isDarkMode,
  onExportError,
}) => {
  const [activeTool, setActiveTool] = useState<CanvasTool>('select');
  const [connectorStyle, setConnectorStyle] = useState<ConnectorStyle>('curved');
  const [arrowHeadType, setArrowHeadType] = useState<ArrowHeadType>('end');

  // Auto-connect flow state
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingElementId, setEditingElementId] = useState<string | null>(null);
  const [isNoteSelectorOpen, setIsNoteSelectorOpen] = useState(false);
  const [marquee, setMarquee] = useState<{
    x: number;
    y: number;
    width: number;
    height: number;
  } | null>(null);

  // Undo / Redo history
  const [history, setHistory] = useState<CanvasElement[][]>([canvasDoc.elements]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [pan, setPanState] = useState(canvasDoc.viewport || { x: 0, y: 0, zoom: 1 });

  // Mirrors of the latest values, for window listeners that outlive a single render.
  const panRef = useRef(pan);
  const docRef = useRef(canvasDoc);
  docRef.current = canvasDoc;

  // Pointer gesture state
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef<{ id: string; time: number } | null>(null);
  const viewportSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPan = useCallback((update: (prev: typeof pan) => typeof pan) => {
    const next = update(panRef.current);
    panRef.current = next;
    setPanState(next);
  }, []);

  /** Persist the viewport without touching undo history. Debounced, since wheel zoom fires rapidly. */
  const saveViewport = useCallback(() => {
    if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
    viewportSaveTimer.current = setTimeout(() => {
      onUpdateCanvas({ ...docRef.current, viewport: panRef.current });
    }, 300);
  }, [onUpdateCanvas]);

  useEffect(() => {
    return () => {
      if (viewportSaveTimer.current) clearTimeout(viewportSaveTimer.current);
    };
  }, []);

  const updateElements = (elements: CanvasElement[]) => {
    docRef.current = { ...docRef.current, elements };
    onUpdateCanvas(docRef.current);
  };

  const pushHistory = (newElements: CanvasElement[]) => {
    const nextHistory = [...history.slice(0, historyIndex + 1), newElements].slice(-MAX_HISTORY);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    updateElements(newElements);
  };

  const pruneSelection = (elements: CanvasElement[]) => {
    const existing = new Set(elements.map(el => el.id));
    setSelectedIds(prev => new Set(Array.from(prev).filter(id => existing.has(id))));
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prev = history[historyIndex - 1];
      setHistoryIndex(historyIndex - 1);
      updateElements(prev);
      pruneSelection(prev);
    }
  };

  const handleRedo = () => {
    if (historyIndex < history.length - 1) {
      const next = history[historyIndex + 1];
      setHistoryIndex(historyIndex + 1);
      updateElements(next);
      pruneSelection(next);
    }
  };

  const screenToCanvas = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { x, y, zoom } = panRef.current;
    return {
      x: Math.round((clientX - rect.left - x) / zoom),
      y: Math.round((clientY - rect.top - y) / zoom),
    };
  };

  const zoomAround = useCallback(
    (screenX: number, screenY: number, nextZoom: number) => {
      setPan(prev => {
        const zoom = clampZoom(nextZoom);
        const worldX = (screenX - prev.x) / prev.zoom;
        const worldY = (screenY - prev.y) / prev.zoom;
        return { x: screenX - worldX * zoom, y: screenY - worldY * zoom, zoom };
      });
    },
    [setPan]
  );

  const pinchDistance = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  /** A second finger means pinch: abandon whatever the first finger had started. */
  const beginPinch = () => {
    const gesture = gestureRef.current;
    if (gesture?.kind === 'move' && gesture.moved) updateElements(gesture.base);
    setMarquee(null);
    gestureRef.current = { kind: 'pinch', distance: pinchDistance(), zoom: panRef.current.zoom };
  };

  const cancelConnecting = () => {
    setIsAutoConnecting(false);
    setConnectSourceId(null);
  };

  const selectTool = (tool: CanvasTool) => {
    setActiveTool(tool);
    // Picking any other tool has to leave connect mode, or clicks keep drawing arrows.
    if (tool !== 'connector') cancelConnecting();
    setConnectSourceId(null);
  };

  const handleCanvasPointerDown = (e: React.PointerEvent) => {
    const target = e.target as Element;
    // If clicking background
    if (target.id !== 'canvas-bg' && target.tagName !== 'svg') return;

    containerRef.current?.focus({ preventScroll: true });
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      beginPinch();
      return;
    }

    if (activeTool !== 'select' && activeTool !== 'connector' && activeTool !== 'marquee') {
      const { x, y } = screenToCanvas(e.clientX, e.clientY);
      createElementAt(activeTool, x, y);
      setActiveTool('select');
      return;
    }

    setEditingElementId(null);
    if (isAutoConnecting) cancelConnecting();

    if (activeTool === 'marquee' || e.shiftKey) {
      const start = screenToCanvas(e.clientX, e.clientY);
      gestureRef.current = {
        kind: 'marquee',
        start,
        current: start,
        base: e.shiftKey ? new Set(selectedIds) : new Set(),
      };
      return;
    }

    setSelectedIds(new Set());
    gestureRef.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      originX: panRef.current.x,
      originY: panRef.current.y,
    };
  };

  const createElementAt = (type: CanvasElementType, x: number, y: number, linkedNote?: Note) => {
    const id = createId('el');
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
      default:
        return;
    }

    pushHistory([...docRef.current.elements, newElement]);
    setSelectedIds(new Set([newElement.id]));
  };

  const connectTo = (el: CanvasElement) => {
    if (!connectSourceId) {
      // Step 1: select source shape
      setConnectSourceId(el.id);
      setSelectedIds(new Set([el.id]));
    } else if (connectSourceId !== el.id) {
      // Step 2: select target shape and connect them!
      const sourceEl = canvasDoc.elements.find(item => item.id === connectSourceId);
      if (sourceEl) {
        const { fromPoint, toPoint } = getAutoConnectPoints(sourceEl, el);
        const newConnector: CanvasElement = {
          id: createId('connector'),
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
      cancelConnecting();
      setActiveTool('select');
    }
  };

  const toggleInSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleElementPointerDown = (e: React.PointerEvent, el: CanvasElement) => {
    // Controls inside an element (the text editor, "Open Note") handle their own pointer input.
    if ((e.target as Element).closest('button, textarea')) {
      e.stopPropagation();
      return;
    }
    e.stopPropagation();

    containerRef.current?.focus({ preventScroll: true });
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointersRef.current.size === 2) {
      beginPinch();
      return;
    }

    // Auto-Connect flow:
    if (isAutoConnecting || activeTool === 'connector') {
      connectTo(el);
      return;
    }

    // Shift-click, or the box-select tool on touch screens, edits the selection without dragging.
    if (e.shiftKey || activeTool === 'marquee') {
      toggleInSelection(el.id);
      return;
    }

    const isInSelection = selectedIds.has(el.id);
    const ids = isInSelection ? new Set(selectedIds) : new Set([el.id]);
    if (!isInSelection) setSelectedIds(ids);

    gestureRef.current = {
      kind: 'move',
      elementId: el.id,
      ids,
      base: canvasDoc.elements,
      latest: canvasDoc.elements,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
    };
  };

  const handleWindowPointerMove = (e: PointerEvent) => {
    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    const gesture = gestureRef.current;
    if (!gesture) return;

    if (gesture.kind === 'pinch') {
      if (pointersRef.current.size !== 2) return;
      const [a, b] = Array.from(pointersRef.current.values());
      const rect = containerRef.current?.getBoundingClientRect();
      zoomAround(
        (a.x + b.x) / 2 - (rect?.left ?? 0),
        (a.y + b.y) / 2 - (rect?.top ?? 0),
        gesture.zoom * (pinchDistance() / gesture.distance)
      );
    } else if (gesture.kind === 'pan') {
      setPan(prev => ({
        ...prev,
        x: gesture.originX + e.clientX - gesture.startX,
        y: gesture.originY + e.clientY - gesture.startY,
      }));
    } else if (gesture.kind === 'marquee') {
      gesture.current = screenToCanvas(e.clientX, e.clientY);
      setMarquee(rectFromPoints(gesture.start, gesture.current));
    } else {
      if (
        !gesture.moved &&
        Math.hypot(e.clientX - gesture.startX, e.clientY - gesture.startY) < TAP_SLOP_PX
      ) {
        return;
      }
      gesture.moved = true;
      const { zoom } = panRef.current;
      gesture.latest = moveElements(
        gesture.base,
        gesture.ids,
        (e.clientX - gesture.startX) / zoom,
        (e.clientY - gesture.startY) / zoom
      );
      updateElements(gesture.latest);
    }
  };

  const handleWindowPointerUp = (e: PointerEvent) => {
    pointersRef.current.delete(e.pointerId);

    const gesture = gestureRef.current;
    if (!gesture) return;
    gestureRef.current = null;

    if (gesture.kind === 'pan' || gesture.kind === 'pinch') {
      saveViewport();
    } else if (gesture.kind === 'marquee') {
      setMarquee(null);
      const hits = elementsInRect(
        canvasDoc.elements,
        rectFromPoints(gesture.start, gesture.current)
      );
      setSelectedIds(new Set([...gesture.base, ...hits]));
    } else if (e.type === 'pointercancel') {
      // The OS took over the gesture: put things back rather than leave them mid-drag.
      if (gesture.moved) updateElements(gesture.base);
    } else if (gesture.moved) {
      // Clicking without moving doesn't create an undo step.
      pushHistory(gesture.latest);
    } else {
      handleTap(gesture.elementId);
    }
  };

  const handleTap = (id: string) => {
    const now = Date.now();
    const last = lastTapRef.current;
    lastTapRef.current = { id, time: now };
    // Tracked by hand because browsers don't reliably fire dblclick for touch.
    if (last?.id === id && now - last.time < DOUBLE_TAP_MS) {
      lastTapRef.current = null;
      const element = canvasDoc.elements.find(el => el.id === id);
      if (element && element.type !== 'connector') {
        setSelectedIds(new Set([id]));
        setEditingElementId(id);
      }
    } else {
      setSelectedIds(new Set([id]));
    }
  };

  // Gestures can end anywhere, including outside the canvas, so listen on the window.
  const windowHandlers = useRef({ handleWindowPointerMove, handleWindowPointerUp });
  windowHandlers.current = { handleWindowPointerMove, handleWindowPointerUp };

  useEffect(() => {
    const onMove = (e: PointerEvent) => windowHandlers.current.handleWindowPointerMove(e);
    const onUp = (e: PointerEvent) => windowHandlers.current.handleWindowPointerUp(e);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, []);

  // Registered natively: React's wheel listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = svg.getBoundingClientRect();
      zoomAround(
        e.clientX - rect.left,
        e.clientY - rect.top,
        panRef.current.zoom * Math.exp(-e.deltaY * 0.0015)
      );
      saveViewport();
    };
    svg.addEventListener('wheel', handleWheel, { passive: false });
    return () => svg.removeEventListener('wheel', handleWheel);
  }, [zoomAround, saveViewport]);

  const handleDeleteSelected = () => {
    if (selectedIds.size === 0) return;
    pushHistory(removeElements(canvasDoc.elements, selectedIds));
    setSelectedIds(new Set());
  };

  const handleDuplicateSelected = () => {
    if (selectedIds.size === 0) return;
    const { elements, newIds } = duplicateElements(canvasDoc.elements, selectedIds);
    pushHistory(elements);
    setSelectedIds(newIds);
  };

  const handleChangeSelectedColor = (color: string) => {
    pushHistory(canvasDoc.elements.map(el => (selectedIds.has(el.id) ? { ...el, color } : el)));
  };

  const handleChangeConnectorStyle = (id: string, style: ConnectorStyle) => {
    const next = canvasDoc.elements.map(el =>
      el.id === id ? { ...el, connectorStyle: style } : el
    );
    pushHistory(next);
  };

  const handleChangeArrowHeadType = (id: string, head: ArrowHeadType) => {
    const next = canvasDoc.elements.map(el => (el.id === id ? { ...el, arrowHeadType: head } : el));
    pushHistory(next);
  };

  // Note cards always show the current title, not whatever it was when they were placed.
  const notesById = useMemo(() => new Map(notes.map(note => [note.id, note])), [notes]);

  const exportableDoc = (): CanvasDocument => ({
    ...canvasDoc,
    elements: canvasDoc.elements.map(el => {
      const note = el.linkedNoteId ? notesById.get(el.linkedNoteId) : undefined;
      return note ? { ...el, linkedNoteTitle: note.title } : el;
    }),
  });

  const exportBaseName = safeFileName(canvasDoc.title, 'diagram');

  const handleExportSvg = () => {
    downloadText(
      canvasToSvg(exportableDoc(), isDarkMode),
      `${exportBaseName}.svg`,
      'image/svg+xml;charset=utf-8'
    );
  };

  const handleExportPng = async () => {
    const doc = exportableDoc();
    const { width, height } = canvasExportSize(doc);
    try {
      downloadBlob(
        await svgToPngBlob(canvasToSvg(doc, isDarkMode), width, height),
        `${exportBaseName}.png`
      );
    } catch (error) {
      onExportError((error as Error).message);
    }
  };

  const handleExportJson = () => {
    downloadText(JSON.stringify(canvasDoc, null, 2), `${exportBaseName}.json`, 'application/json');
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isEditableTarget(e.target)) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();

    if (mod && key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
    } else if (mod && key === 'y') {
      e.preventDefault();
      handleRedo();
    } else if (mod && key === 'a') {
      e.preventDefault();
      setSelectedIds(new Set(canvasDoc.elements.map(el => el.id)));
    } else if (mod && key === 'd') {
      e.preventDefault();
      handleDuplicateSelected();
    } else if (mod || e.altKey) {
      return;
    } else if (key === 'delete' || key === 'backspace') {
      if (selectedIds.size > 0) {
        e.preventDefault();
        handleDeleteSelected();
      }
    } else if (key === 'escape') {
      selectTool('select');
      setSelectedIds(new Set());
    } else if (key === 'v') {
      selectTool('select');
    } else if (key === 'enter') {
      const [id] = Array.from(selectedIds);
      const element = canvasDoc.elements.find(el => el.id === id);
      if (selectedIds.size === 1 && element && element.type !== 'connector') {
        e.preventDefault();
        setEditingElementId(id);
      }
    } else if (key === 'tab') {
      // Only while the board itself has focus, so Tab still moves through the toolbar.
      if (document.activeElement !== containerRef.current) return;
      const shapes = canvasDoc.elements.filter(el => el.type !== 'connector');
      if (shapes.length === 0) return;
      e.preventDefault();
      const [current] = Array.from(selectedIds);
      const index = shapes.findIndex(el => el.id === current);
      const nextIndex =
        index === -1 ? 0 : (index + (e.shiftKey ? -1 : 1) + shapes.length) % shapes.length;
      setSelectedIds(new Set([shapes[nextIndex].id]));
    } else if (key.startsWith('arrow') && selectedIds.size > 0) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = key === 'arrowleft' ? -step : key === 'arrowright' ? step : 0;
      const dy = key === 'arrowup' ? -step : key === 'arrowdown' ? step : 0;
      pushHistory(moveElements(canvasDoc.elements, selectedIds, dx, dy));
    }
  };

  const keyHandler = useRef(handleKeyDown);
  keyHandler.current = handleKeyDown;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const zoomFromCenter = (factor: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    zoomAround((rect?.width ?? 0) / 2, (rect?.height ?? 0) / 2, panRef.current.zoom * factor);
    saveViewport();
  };

  const selectedElements = canvasDoc.elements.filter(el => selectedIds.has(el.id));
  const singleSelected = selectedElements.length === 1 ? selectedElements[0] : null;
  const showConnectBanner = isAutoConnecting || activeTool === 'connector';

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      role="application"
      aria-label={`Canvas board ${canvasDoc.title}. Tab moves between shapes, arrow keys move the selection.`}
      data-testid="canvas-workspace"
      onPointerDown={handleCanvasPointerDown}
      className="relative flex-1 w-full min-h-0 bg-background overflow-hidden select-none font-sans focus:outline-none"
    >
      {/* Top Toolbar with Multiple Shapes and Arrow Options */}
      <CanvasToolbar
        activeTool={activeTool}
        setActiveTool={selectTool}
        connectorStyle={connectorStyle}
        setConnectorStyle={setConnectorStyle}
        arrowHeadType={arrowHeadType}
        setArrowHeadType={setArrowHeadType}
        isAutoConnecting={isAutoConnecting}
        onToggleAutoConnect={() => {
          setIsAutoConnecting(!isAutoConnecting);
          setConnectSourceId(null);
          setActiveTool('select');
        }}
        canUndo={historyIndex > 0}
        canRedo={historyIndex < history.length - 1}
        onUndo={handleUndo}
        onRedo={handleRedo}
        gridEnabled={canvasDoc.gridEnabled}
        onToggleGrid={() => onUpdateCanvas({ ...canvasDoc, gridEnabled: !canvasDoc.gridEnabled })}
        onAddLinkedNoteCard={() => setIsNoteSelectorOpen(true)}
      />

      {/* Auto-Connect Prompt Banner */}
      {showConnectBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 bg-indigo-600 text-white px-4 py-1.5 rounded-full shadow-xl text-xs font-semibold flex items-center space-x-2 whitespace-nowrap">
          <Workflow className="w-4 h-4" />
          <span>
            {connectSourceId
              ? 'Click target shape to complete connection'
              : 'Click first shape to start connector'}
          </span>
        </div>
      )}

      {/* Selected Element Quick Palette */}
      {selectedElements.length > 0 && !showConnectBanner && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-10 flex items-center bg-surface/95 dark:bg-slate-900/95 backdrop-blur-md border border-border dark:border-slate-800 px-3.5 py-1.5 rounded-xl shadow-xl space-x-2 text-xs max-w-[calc(100%-1rem)] overflow-x-auto">
          {selectedElements.length > 1 && (
            <span className="font-bold text-slate-300 whitespace-nowrap" role="status">
              {selectedElements.length} selected
            </span>
          )}

          {singleSelected?.type === 'connector' ? (
            /* Connector Specific Options */
            <div className="flex items-center space-x-1.5">
              <span className="text-slate-400 font-bold">Arrow:</span>
              <button
                onClick={() => handleChangeConnectorStyle(singleSelected.id, 'curved')}
                title="Curved Flow"
                className={`p-1 rounded ${singleSelected.connectorStyle === 'curved' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <Spline className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleChangeConnectorStyle(singleSelected.id, 'orthogonal')}
                title="90° Step Orthogonal"
                className={`p-1 rounded ${singleSelected.connectorStyle === 'orthogonal' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <GitCommit className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleChangeConnectorStyle(singleSelected.id, 'straight')}
                title="Straight Arrow"
                className={`p-1 rounded ${singleSelected.connectorStyle === 'straight' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`}
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() =>
                  handleChangeArrowHeadType(
                    singleSelected.id,
                    singleSelected.arrowHeadType === 'both' ? 'end' : 'both'
                  )
                }
                title="Toggle Bidirectional Arrow"
                className={`px-1.5 py-0.5 rounded text-xs font-mono font-bold ${
                  singleSelected.arrowHeadType === 'both'
                    ? 'bg-indigo-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                &lt;-&gt;
              </button>
            </div>
          ) : (
            /* Shape Specific Options */
            <>
              {singleSelected && (
                <>
                  <button
                    onClick={() => {
                      setIsAutoConnecting(true);
                      setConnectSourceId(singleSelected.id);
                    }}
                    className="flex items-center space-x-1 px-2 py-1 rounded bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 font-semibold whitespace-nowrap"
                    title="Connect arrow from this shape to another"
                  >
                    <Workflow className="w-3.5 h-3.5" />
                    <span>Connect To...</span>
                  </button>
                  <div className="h-4 w-[1px] bg-slate-800 mx-1" />
                </>
              )}
              <span className="text-slate-400 font-bold">Color:</span>
              {['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e', '#fef08a', '#1e293b'].map(
                c => (
                  <button
                    key={c}
                    onClick={() => handleChangeSelectedColor(c)}
                    aria-label={`Set color ${c}`}
                    className="w-4 h-4 shrink-0 rounded-full border border-black/20 hover:scale-110 transition-transform"
                    style={{ backgroundColor: c }}
                  />
                )
              )}
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
          <div className="bg-surface dark:bg-[#111827] border border-border dark:border-slate-800 rounded-2xl p-5 w-96 max-w-full shadow-2xl space-y-3">
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
        ref={svgRef}
        id="notemesh-canvas-svg"
        // touch-action: none stops the browser claiming the gesture for scrolling or page zoom.
        style={{ touchAction: 'none' }}
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
              patternTransform={`translate(${pan.x}, ${pan.y}) scale(${pan.zoom})`}
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
            <polygon points="0 0, 10 3.5, 0 7" fill={isDarkMode ? '#818cf8' : '#6366f1'} />
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
            <polygon points="10 0, 0 3.5, 10 7" fill={isDarkMode ? '#818cf8' : '#6366f1'} />
          </marker>
        </defs>

        {/* Background Grid */}
        <rect
          id="canvas-bg"
          data-testid="canvas-bg"
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill={canvasDoc.gridEnabled ? 'url(#grid-pattern)' : 'transparent'}
        />

        {/* Pan and Zoom Layer */}
        <g
          transform={`translate(${pan.x}, ${pan.y}) scale(${pan.zoom})`}
          data-testid="canvas-viewport"
        >
          {/* Connectors / Arrows */}
          {canvasDoc.elements
            .filter(el => el.type === 'connector')
            .map(el => {
              const pathD = connectorPath(el);
              const isSelected = selectedIds.has(el.id);
              const hasStartArrow = el.arrowHeadType === 'both';

              return (
                <g
                  key={el.id}
                  onPointerDown={e => handleElementPointerDown(e, el)}
                  className="cursor-pointer"
                  data-element-id={el.id}
                >
                  {/* Invisible wider hit-area */}
                  <path d={pathD} fill="none" stroke="transparent" strokeWidth="14" />
                  {/* Visual Line */}
                  <path
                    d={pathD}
                    fill="none"
                    stroke={isSelected ? '#6366f1' : isDarkMode ? '#818cf8' : '#4f46e5'}
                    strokeWidth={isSelected ? '2.5' : '2'}
                    strokeDasharray={el.connectorStyle === 'dashed' ? '6,4' : undefined}
                    markerStart={hasStartArrow ? 'url(#arrowhead-start)' : undefined}
                    markerEnd={el.arrowHeadType === 'none' ? undefined : 'url(#arrowhead)'}
                  />
                </g>
              );
            })}

          {/* Shapes & Note Cards */}
          {canvasDoc.elements
            .filter(el => el.type !== 'connector')
            .map(el => {
              const isSelected = selectedIds.has(el.id);
              const isConnectSource = connectSourceId === el.id;
              const linkedNote = el.linkedNoteId ? notesById.get(el.linkedNoteId) : undefined;
              const isBrokenCard =
                el.type === 'note-card' && Boolean(el.linkedNoteId) && !linkedNote;
              const boardText = isDarkMode ? '#f1f5f9' : '#0f172a';
              const textColor =
                el.type === 'note-card' ? boardText : readableTextColor(el.color, boardText);

              return (
                <g
                  key={el.id}
                  transform={`translate(${el.x}, ${el.y})`}
                  onPointerDown={e => handleElementPointerDown(e, el)}
                  className="cursor-move group"
                  data-element-id={el.id}
                  data-selected={isSelected}
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

                  {/* Selection outline: visible on every shape, including borderless text */}
                  {isSelected && !isConnectSource && (
                    <rect
                      x="-4"
                      y="-4"
                      width={el.width + 8}
                      height={el.height + 8}
                      rx="8"
                      fill="none"
                      stroke="#6366f1"
                      strokeWidth="1.5"
                      strokeDasharray="4,3"
                    />
                  )}

                  {/* Rectangle */}
                  {el.type === 'rectangle' && (
                    <rect
                      width={el.width}
                      height={el.height}
                      rx="10"
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : el.strokeColor || '#475569'}
                      strokeWidth={isSelected ? '2.5' : '1.5'}
                    />
                  )}

                  {/* Diamond */}
                  {el.type === 'diamond' && (
                    <polygon
                      points={diamondPoints(el.width, el.height)}
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
                        d={cylinderBodyPath(el.width, el.height)}
                        fill={el.color || '#1e293b'}
                        stroke={isSelected ? '#6366f1' : el.strokeColor || '#475569'}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />
                      <ellipse
                        cx={el.width / 2}
                        cy={16}
                        rx={el.width / 2}
                        ry={14}
                        fill={el.color || '#1e293b'}
                        stroke={isSelected ? '#6366f1' : el.strokeColor || '#475569'}
                        strokeWidth={isSelected ? '2.5' : '1.5'}
                      />
                    </g>
                  )}

                  {/* Cloud */}
                  {el.type === 'cloud' && (
                    <path
                      d={CLOUD_PATH}
                      transform={cloudScale(el.width, el.height)}
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : el.strokeColor || '#06b6d4'}
                      strokeWidth={isSelected ? '3' : '2'}
                    />
                  )}

                  {/* Hexagon */}
                  {el.type === 'hexagon' && (
                    <polygon
                      points={hexagonPoints(el.width, el.height)}
                      fill={el.color || '#1e293b'}
                      stroke={isSelected ? '#6366f1' : el.strokeColor || '#10b981'}
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
                        fill={isBrokenCard ? '#64748b' : '#6366f1'}
                      />
                      <text
                        x="12"
                        y="18"
                        fill="#ffffff"
                        fontSize="12"
                        fontWeight="700"
                        fontFamily="Poppins, sans-serif"
                      >
                        {isBrokenCard
                          ? `${el.linkedNoteTitle || 'Note'} (deleted)`
                          : linkedNote?.title || el.linkedNoteTitle || 'Note'}
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
                    <div className="w-full h-full flex flex-col justify-center items-center text-center p-1 select-text">
                      {editingElementId === el.id ? (
                        <textarea
                          autoFocus
                          aria-label="Element text"
                          value={el.text || ''}
                          onChange={e => {
                            const val = e.target.value;
                            const next = canvasDoc.elements.map(item =>
                              item.id === el.id ? { ...item, text: val } : item
                            );
                            onUpdateCanvas({ ...canvasDoc, elements: next });
                          }}
                          onKeyDown={e => {
                            if (e.key === 'Escape') e.currentTarget.blur();
                          }}
                          onBlur={() => {
                            setEditingElementId(null);
                            pushHistory(docRef.current.elements);
                          }}
                          style={{ color: textColor }}
                          className="w-full h-full bg-transparent resize-none border-none focus:outline-none text-xs font-semibold text-center"
                        />
                      ) : (
                        <span
                          style={{ color: textColor }}
                          className={`text-xs leading-tight line-clamp-3 ${el.type === 'sticky' ? 'font-medium' : 'font-bold'}`}
                        >
                          {el.text || 'Type here...'}
                        </span>
                      )}

                      {/* Jump to note button on Note Card */}
                      {el.type === 'note-card' && el.linkedNoteId && linkedNote && (
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

          {/* Box selection */}
          {marquee && (
            <rect
              data-testid="canvas-marquee"
              x={marquee.x}
              y={marquee.y}
              width={marquee.width}
              height={marquee.height}
              fill="rgba(99, 102, 241, 0.12)"
              stroke="#6366f1"
              strokeWidth={1 / pan.zoom}
              strokeDasharray="4,3"
              pointerEvents="none"
            />
          )}
        </g>
      </svg>

      {/* Bottom Zoom Controls */}
      <div className="absolute bottom-6 left-6 z-10 flex items-center space-x-1.5 bg-surface/90 dark:bg-slate-900/90 backdrop-blur-md border border-border dark:border-slate-800 p-1.5 rounded-xl shadow-xl text-slate-400">
        <button
          onClick={() => zoomFromCenter(1.2)}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => zoomFromCenter(1 / 1.2)}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={() => {
            setPan(() => ({ x: 50, y: 50, zoom: 1 }));
            saveViewport();
          }}
          className="p-2 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
          title="Recenter"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <span
          className="text-xs font-mono font-semibold px-2 text-slate-300"
          data-testid="canvas-zoom"
        >
          {Math.round(pan.zoom * 100)}%
        </span>
      </div>

      {/* Bottom Export Controls */}
      <div className="absolute bottom-6 right-6 z-10 flex items-center space-x-1 bg-surface/90 dark:bg-slate-900/90 backdrop-blur-md border border-border dark:border-slate-800 p-1.5 rounded-xl shadow-xl text-xs font-bold text-slate-400">
        <span className="px-1.5 hidden sm:inline">Export</span>
        <button
          onClick={handleExportSvg}
          title="Export whole board as SVG"
          className="px-2 py-1.5 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          SVG
        </button>
        <button
          onClick={() => void handleExportPng()}
          title="Export whole board as PNG"
          className="px-2 py-1.5 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          PNG
        </button>
        <button
          onClick={handleExportJson}
          title="Export board data as JSON"
          className="px-2 py-1.5 hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          JSON
        </button>
      </div>
    </div>
  );
};
