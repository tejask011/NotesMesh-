import React, { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { Note } from '../../core/domain/note';
import { GraphNode, GraphFilterConfig } from '../../core/domain/graph';
import { buildGraphData } from '../../core/graph/graphBuilder';
import {
  ALPHA_DECAY,
  ALPHA_MIN,
  seedPosition,
  stepSimulation,
} from '../../core/graph/forceSimulation';
import { collectAllTags } from '../../core/notes/tags';
import { GraphControls } from './GraphControls';
import { ZoomIn, ZoomOut, Maximize2 } from 'lucide-react';

interface KnowledgeGraphViewProps {
  notes: Note[];
  activeNoteId: string | null;
  onOpenNote: (noteId: string) => void;
  isDarkMode: boolean;
}

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 2.5;
/** Total kinetic energy below which the layout counts as settled and animation stops. */
const SETTLED_ENERGY = 0.05;
/** Above this many nodes, labels only show when zoomed in, hovered or linked to the hover. */
const LABEL_NODE_LIMIT = 200;
const TAP_SLOP_PX = 5;
const PAN_STEP_PX = 60;
/**
 * Paths are flushed at this size. Rasterizing cost grows with a path's size and
 * self-overlap, so many small batches are far cheaper than one huge path, while
 * still avoiding the cost of a separate draw call per edge or node.
 */
const PATH_BATCH_SIZE = 256;
/**
 * Long translucent lines are what limit the frame rate on a large graph (measured
 * at 8 fps with them and 47 without at 3,000 nodes, even with a GPU). So while it's
 * moving, a large graph draws a capped set of on-screen edges, then all of them once still.
 */
const MOVING_EDGE_LIMIT = 300;
const INTERACTION_SETTLE_MS = 200;

const clampZoom = (zoom: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

export const KnowledgeGraphView: React.FC<KnowledgeGraphViewProps> = ({
  notes,
  activeNoteId,
  onOpenNote,
  isDarkMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [filterConfig, setFilterConfig] = useState<GraphFilterConfig>({
    showTags: true,
    showOrphans: true,
    showMissingLinks: true,
    searchFilter: '',
    tagFilter: null,
    colorMode: 'type',
    linkDistance: 130,
    repelForce: 450,
    collisionRadius: 28,
    focusNodeId: null,
    maxDepth: null,
  });

  const availableTags = useMemo(() => collectAllTags(notes), [notes]);

  // Viewport transforms (Pan & Zoom). The ref is what the render loop reads.
  const [viewport, setViewportState] = useState({ x: 0, y: 0, zoom: 1 });
  const viewportRef = useRef(viewport);

  const hoveredNodeRef = useRef<GraphNode | null>(null);
  const highlightedIdRef = useRef<string | null>(null);

  // Active pointers, for pinch detection
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<
    | { kind: 'pan'; startX: number; startY: number; originX: number; originY: number }
    | { kind: 'node'; nodeId: string; startX: number; startY: number; moved: boolean }
    | { kind: 'pinch'; distance: number; zoom: number }
    | null
  >(null);

  // Force sliders only change the layout, so moving them shouldn't rebuild the graph.
  const { linkDistance, repelForce, collisionRadius, ...structureConfig } = filterConfig;
  const structureKey = JSON.stringify(structureConfig);

  // Graph data simulation state
  const graphData = useMemo(() => {
    return buildGraphData(notes, {
      ...structureConfig,
      linkDistance,
      repelForce,
      collisionRadius,
      focusNodeId: filterConfig.focusNodeId ?? activeNoteId,
    });
    // structureKey stands in for the structural fields of filterConfig.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes, structureKey, activeNoteId]);

  const fullNodeCount = useMemo(() => {
    return buildGraphData(notes, {
      ...filterConfig,
      searchFilter: '',
      tagFilter: null,
      showOrphans: true,
      showMissingLinks: true,
      maxDepth: null,
    }).nodes.length;
    // Only the note set matters: this is the "of N" in "showing M of N".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notes]);

  // Persistent simulated nodes
  const simNodesRef = useRef<Map<string, GraphNode>>(new Map());

  // The render loop sleeps once settled; anything that changes the picture wakes it.
  const animationRef = useRef<number | null>(null);
  const tickRef = useRef<(time: number) => void>(() => {});
  const lastTickRef = useRef<number | null>(null);
  const isSettledRef = useRef(false);
  const alphaRef = useRef(1);

  const requestFrame = useCallback(() => {
    if (animationRef.current === null) {
      animationRef.current = requestAnimationFrame(time => {
        animationRef.current = null;
        tickRef.current(time);
      });
    }
  }, []);

  const reheat = useCallback(
    (alpha = 1) => {
      alphaRef.current = Math.max(alphaRef.current, alpha);
      isSettledRef.current = false;
      requestFrame();
    },
    [requestFrame]
  );

  // Until this time the user is panning or zooming, so drawing favors speed over completeness.
  const interactingUntilRef = useRef(0);
  const interactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setViewport = useCallback(
    (update: (prev: typeof viewport) => typeof viewport) => {
      const next = update(viewportRef.current);
      viewportRef.current = next;
      setViewportState(next);

      interactingUntilRef.current = performance.now() + INTERACTION_SETTLE_MS;
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
      // Once things stop moving, draw the complete picture.
      interactionTimerRef.current = setTimeout(requestFrame, INTERACTION_SETTLE_MS);
      requestFrame();
    },
    [requestFrame]
  );

  useEffect(() => {
    return () => {
      if (interactionTimerRef.current) clearTimeout(interactionTimerRef.current);
    };
  }, []);

  // Initialize or update node positions centered at (0, 0)
  useEffect(() => {
    const existing = simNodesRef.current;
    const nextMap = new Map<string, GraphNode>();

    graphData.nodes.forEach((node, i) => {
      const old = existing.get(node.id);
      if (old) {
        nextMap.set(node.id, { ...node, x: old.x, y: old.y, vx: old.vx || 0, vy: old.vy || 0 });
      } else {
        nextMap.set(node.id, { ...node, ...seedPosition(i), vx: 0, vy: 0 });
      }
    });

    simNodesRef.current = nextMap;
    reheat();
  }, [graphData, reheat]);

  useEffect(() => {
    reheat(0.5);
  }, [linkDistance, repelForce, collisionRadius, reheat]);

  useEffect(() => {
    requestFrame();
  }, [isDarkMode, filterConfig.colorMode, requestFrame]);

  // Center viewport on initial mount & canvas resize
  const recenter = useCallback(() => {
    if (canvasRef.current) {
      const { clientWidth, clientHeight } = canvasRef.current;
      setViewport(() => ({ x: clientWidth / 2, y: clientHeight / 2, zoom: 1 }));
    }
  }, [setViewport]);

  useEffect(() => {
    recenter();
  }, [recenter]);

  const resetSimulation = useCallback(() => {
    let index = 0;
    simNodesRef.current.forEach(node => {
      Object.assign(node, seedPosition(index));
      node.vx = (Math.random() - 0.5) * 4;
      node.vy = (Math.random() - 0.5) * 4;
      index += 1;
    });
    reheat();
  }, [reheat]);

  // Main animation / simulation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const targetWidth = Math.round(w * dpr);
      const targetHeight = Math.round(h * dpr);
      if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
      }

      const { x: vx, y: vy, zoom } = viewportRef.current;
      const hoveredNode = hoveredNodeRef.current;
      const highlightedId = highlightedIdRef.current;
      const emphasizedId = hoveredNode?.id ?? highlightedId;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, w, h);

      // Apply viewport pan and zoom
      ctx.translate(vx, vy);
      ctx.scale(zoom, zoom);

      const nodeMap = simNodesRef.current;

      // World-space bounds of the screen, so offscreen work can be skipped
      const margin = 40 / zoom;
      const minX = -vx / zoom - margin;
      const minY = -vy / zoom - margin;
      const maxX = (w - vx) / zoom + margin;
      const maxY = (h - vy) / zoom + margin;
      const isVisible = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;

      const isMoving = !isSettledRef.current || performance.now() < interactingUntilRef.current;
      const simplifyEdges = isMoving && nodeMap.size > LABEL_NODE_LIMIT;
      let edgesDrawn = 0;

      // Draw Edges in batches
      const neighbors = new Set<string>();
      ctx.strokeStyle = isDarkMode ? 'rgba(99, 102, 241, 0.35)' : 'rgba(148, 163, 184, 0.7)';
      ctx.lineWidth = 1.2;
      let batched = 0;
      ctx.beginPath();
      for (const edge of graphData.edges) {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target || source.x === undefined || target.x === undefined) continue;

        if (emphasizedId && (edge.source === emphasizedId || edge.target === emphasizedId)) {
          neighbors.add(edge.source);
          neighbors.add(edge.target);
          continue;
        }
        const sourceVisible = isVisible(source.x, source.y as number);
        const targetVisible = isVisible(target.x, target.y as number);
        if (!sourceVisible && !targetVisible) continue;
        if (simplifyEdges && (!sourceVisible || !targetVisible || edgesDrawn >= MOVING_EDGE_LIMIT))
          continue;
        edgesDrawn += 1;

        ctx.moveTo(source.x, source.y as number);
        ctx.lineTo(target.x, target.y as number);
        if (++batched === PATH_BATCH_SIZE) {
          ctx.stroke();
          ctx.beginPath();
          batched = 0;
        }
      }
      ctx.stroke();

      if (emphasizedId) {
        ctx.beginPath();
        for (const edge of graphData.edges) {
          if (edge.source !== emphasizedId && edge.target !== emphasizedId) continue;
          const source = nodeMap.get(edge.source);
          const target = nodeMap.get(edge.target);
          if (!source || !target || source.x === undefined || target.x === undefined) continue;
          ctx.moveTo(source.x, source.y as number);
          ctx.lineTo(target.x, target.y as number);
        }
        ctx.strokeStyle = isDarkMode ? '#38bdf8' : '#4f46e5';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // Draw Nodes: grouped by color and batched, far cheaper than a fill per node
      const isLargeGraph = nodeMap.size > LABEL_NODE_LIMIT;
      const showAllLabels = isLargeGraph ? zoom >= 1.2 : zoom >= 0.5;
      const nodeFill = (node: GraphNode) => {
        if (node.type === 'missing') return '#f59e0b';
        if (filterConfig.colorMode !== 'type' && node.color) return node.color;
        if (node.isOrphan) return isDarkMode ? '#64748b' : '#94a3b8';
        return isDarkMode ? '#38bdf8' : '#4f46e5';
      };

      const nodesByFill = new Map<string, GraphNode[]>();
      const labeled: GraphNode[] = [];
      nodeMap.forEach(node => {
        if (node.x === undefined || node.y === undefined || !isVisible(node.x, node.y)) return;
        const fill = nodeFill(node);
        const group = nodesByFill.get(fill);
        if (group) group.push(node);
        else nodesByFill.set(fill, [node]);
        if (showAllLabels || emphasizedId === node.id || neighbors.has(node.id)) labeled.push(node);
      });

      const emphasizedNode = emphasizedId ? nodeMap.get(emphasizedId) : undefined;
      const radiusOf = (node: GraphNode) =>
        (node.radius || 9) * (node === emphasizedNode ? 1.35 : 1);

      // Node Glow
      if (emphasizedNode?.x !== undefined && emphasizedNode.y !== undefined) {
        ctx.beginPath();
        ctx.arc(emphasizedNode.x, emphasizedNode.y, radiusOf(emphasizedNode) + 8, 0, Math.PI * 2);
        ctx.fillStyle = isDarkMode ? 'rgba(56, 189, 248, 0.35)' : 'rgba(79, 70, 229, 0.25)';
        ctx.fill();
      }

      // Main Node Body
      ctx.lineWidth = 2;
      ctx.strokeStyle = isDarkMode ? '#0f172a' : '#ffffff';
      nodesByFill.forEach((group, fill) => {
        ctx.fillStyle = fill;
        for (let start = 0; start < group.length; start += PATH_BATCH_SIZE) {
          ctx.beginPath();
          for (const node of group.slice(start, start + PATH_BATCH_SIZE)) {
            const radius = radiusOf(node);
            ctx.moveTo((node.x as number) + radius, node.y as number);
            ctx.arc(node.x as number, node.y as number, radius, 0, Math.PI * 2);
          }
          ctx.fill();
          // Outlines separate overlapping nodes, but cost more than the fills at this scale.
          if (!isLargeGraph) ctx.stroke();
        }
      });

      // Node Label - min 12px, font-weight 600
      ctx.textAlign = 'center';
      ctx.fillStyle = isDarkMode ? '#f8fafc' : '#0f172a';
      for (const node of labeled) {
        ctx.font = `600 ${node === emphasizedNode ? 14 : 12}px Inter, sans-serif`;
        ctx.fillText(node.label, node.x as number, (node.y as number) + radiusOf(node) + 15);
      }

      ctx.restore();
    };

    tickRef.current = time => {
      render();
      if (isSettledRef.current) {
        lastTickRef.current = null;
        return;
      }

      // Cool by elapsed time rather than frames, so slow devices settle just as soon.
      const elapsed =
        lastTickRef.current === null ? 16.7 : Math.min(250, time - lastTickRef.current);
      lastTickRef.current = time;

      const gesture = gestureRef.current;
      const energy = stepSimulation(
        Array.from(simNodesRef.current.values()),
        graphData.edges,
        simNodesRef.current,
        {
          repelForce,
          linkDistance,
          collisionRadius,
          pinnedNodeId: gesture?.kind === 'node' ? gesture.nodeId : null,
          alpha: alphaRef.current,
        }
      );
      alphaRef.current *= Math.pow(ALPHA_DECAY, elapsed / 16.7);

      // A settled layout stops using the CPU; per-node energy keeps this size-independent.
      const isAtRest =
        energy / Math.max(1, simNodesRef.current.size) < SETTLED_ENERGY ||
        alphaRef.current < ALPHA_MIN;
      if (isAtRest && gesture?.kind !== 'node') isSettledRef.current = true;
      requestFrame(); // When settling, this is one last frame showing the final positions.
    };

    requestFrame();
    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [
    graphData,
    repelForce,
    linkDistance,
    collisionRadius,
    isDarkMode,
    filterConfig.colorMode,
    requestFrame,
  ]);

  // Canvas size changes (window resize, panel layout) need a redraw even when settled
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => requestFrame());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [requestFrame]);

  const screenToWorld = (screenX: number, screenY: number) => {
    const { x, y, zoom } = viewportRef.current;
    return { x: (screenX - x) / zoom, y: (screenY - y) / zoom };
  };

  const getNodeAtPoint = (worldX: number, worldY: number, slop: number): GraphNode | null => {
    let hit: GraphNode | null = null;
    simNodesRef.current.forEach(node => {
      if (node.x === undefined || node.y === undefined) return;
      const dx = worldX - node.x;
      const dy = worldY - node.y;
      const r = (node.radius || 9) + slop;
      if (dx * dx + dy * dy <= r * r) hit = node;
    });
    return hit;
  };

  const zoomAround = useCallback(
    (screenX: number, screenY: number, nextZoom: number) => {
      setViewport(prev => {
        const zoom = clampZoom(nextZoom);
        const worldX = (screenX - prev.x) / prev.zoom;
        const worldY = (screenY - prev.y) / prev.zoom;
        return { x: screenX - worldX * zoom, y: screenY - worldY * zoom, zoom };
      });
    },
    [setViewport]
  );

  const pointerPosition = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const pinchDistance = () => {
    const [a, b] = Array.from(pointersRef.current.values());
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    // Capturing keeps a drag alive when the pointer leaves the canvas.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    e.currentTarget.focus({ preventScroll: true });

    const position = pointerPosition(e);
    pointersRef.current.set(e.pointerId, position);

    if (pointersRef.current.size === 2) {
      gestureRef.current = {
        kind: 'pinch',
        distance: pinchDistance(),
        zoom: viewportRef.current.zoom,
      };
      return;
    }

    const world = screenToWorld(position.x, position.y);
    // Fingers are less precise than a cursor, so touch gets a larger hit area.
    const hit = getNodeAtPoint(world.x, world.y, e.pointerType === 'touch' ? 16 : 6);
    gestureRef.current = hit
      ? { kind: 'node', nodeId: hit.id, startX: position.x, startY: position.y, moved: false }
      : {
          kind: 'pan',
          startX: position.x,
          startY: position.y,
          originX: viewportRef.current.x,
          originY: viewportRef.current.y,
        };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const position = pointerPosition(e);
    const gesture = gestureRef.current;

    if (pointersRef.current.has(e.pointerId)) {
      pointersRef.current.set(e.pointerId, position);
    }

    if (gesture?.kind === 'pinch' && pointersRef.current.size === 2) {
      const [a, b] = Array.from(pointersRef.current.values());
      zoomAround(
        (a.x + b.x) / 2,
        (a.y + b.y) / 2,
        gesture.zoom * (pinchDistance() / gesture.distance)
      );
    } else if (gesture?.kind === 'pan') {
      setViewport(prev => ({
        ...prev,
        x: gesture.originX + position.x - gesture.startX,
        y: gesture.originY + position.y - gesture.startY,
      }));
    } else if (gesture?.kind === 'node') {
      if (Math.hypot(position.x - gesture.startX, position.y - gesture.startY) >= TAP_SLOP_PX) {
        gesture.moved = true;
      }
      if (gesture.moved) {
        const world = screenToWorld(position.x, position.y);
        const node = simNodesRef.current.get(gesture.nodeId);
        if (node) {
          node.x = world.x;
          node.y = world.y;
          node.vx = 0;
          node.vy = 0;
          reheat(0.3);
        }
      }
    } else if (!gesture && e.pointerType === 'mouse') {
      const world = screenToWorld(position.x, position.y);
      const hit = getNodeAtPoint(world.x, world.y, 6);
      if (hit?.id !== hoveredNodeRef.current?.id) {
        hoveredNodeRef.current = hit;
        requestFrame();
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    const gesture = gestureRef.current;

    if (gesture?.kind === 'node' && !gesture.moved && e.type === 'pointerup') {
      const node = simNodesRef.current.get(gesture.nodeId);
      if (node?.type === 'note') onOpenNote(node.id);
    }

    const wasDragging = gesture?.kind === 'node' && gesture.moved;
    gestureRef.current = null;
    if (wasDragging) reheat(0.3);
  };

  // Registered natively: React's wheel listener is passive, so it can't stop the page scrolling.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const factor = e.deltaY < 0 ? 1.08 : 0.92;
      zoomAround(e.clientX - rect.left, e.clientY - rect.top, viewportRef.current.zoom * factor);
    };
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', handleWheel);
  }, [zoomAround]);

  const cycleHighlight = (direction: 1 | -1) => {
    const ids = Array.from(simNodesRef.current.keys());
    if (ids.length === 0) return;
    const current = highlightedIdRef.current ? ids.indexOf(highlightedIdRef.current) : -1;
    const nextId = ids[(current + direction + ids.length) % ids.length];
    highlightedIdRef.current = nextId;

    // Bring the node into view so keyboard users can see where they are.
    const node = simNodesRef.current.get(nextId);
    const canvas = canvasRef.current;
    if (node?.x !== undefined && node.y !== undefined && canvas) {
      const { x: worldX, y: worldY } = node;
      setViewport(prev => ({
        ...prev,
        x: canvas.clientWidth / 2 - worldX * prev.zoom,
        y: canvas.clientHeight / 2 - worldY * prev.zoom,
      }));
    }
    requestFrame();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const canvas = e.currentTarget;
    const centerX = canvas.clientWidth / 2;
    const centerY = canvas.clientHeight / 2;
    const zoom = viewportRef.current.zoom;

    switch (e.key) {
      case 'ArrowLeft':
        setViewport(prev => ({ ...prev, x: prev.x + PAN_STEP_PX }));
        break;
      case 'ArrowRight':
        setViewport(prev => ({ ...prev, x: prev.x - PAN_STEP_PX }));
        break;
      case 'ArrowUp':
        setViewport(prev => ({ ...prev, y: prev.y + PAN_STEP_PX }));
        break;
      case 'ArrowDown':
        setViewport(prev => ({ ...prev, y: prev.y - PAN_STEP_PX }));
        break;
      case '+':
      case '=':
        zoomAround(centerX, centerY, zoom * 1.2);
        break;
      case '-':
        zoomAround(centerX, centerY, zoom / 1.2);
        break;
      case '0':
        recenter();
        break;
      case ']':
        cycleHighlight(1);
        break;
      case '[':
        cycleHighlight(-1);
        break;
      case 'Enter': {
        const node = highlightedIdRef.current
          ? simNodesRef.current.get(highlightedIdRef.current)
          : null;
        if (node?.type === 'note') onOpenNote(node.id);
        break;
      }
      default:
        return;
    }
    e.preventDefault();
  };

  const zoomFromCenter = (factor: number) => {
    const canvas = canvasRef.current;
    if (canvas)
      zoomAround(
        canvas.clientWidth / 2,
        canvas.clientHeight / 2,
        viewportRef.current.zoom * factor
      );
  };

  const activeNoteTitle = notes.find(note => note.id === activeNoteId)?.title ?? null;

  return (
    <div className="relative flex-1 min-w-0 h-full min-h-0 bg-background overflow-hidden">
      {/* Floating Controls Panel */}
      <GraphControls
        config={filterConfig}
        onChangeConfig={setFilterConfig}
        onResetSimulation={resetSimulation}
        availableTags={availableTags}
        notes={notes}
        activeNoteTitle={activeNoteTitle}
        visibleCount={graphData.nodes.length}
        totalCount={fullNodeCount}
      />

      {/* Floating Zoom & Center bar */}
      <div className="absolute bottom-6 left-6 z-10 flex items-center space-x-1.5 bg-surface/90 dark:bg-slate-900/90 backdrop-blur-md border border-border dark:border-slate-800 p-1.5 rounded-xl shadow-xl text-slate-400">
        <button
          onClick={() => zoomFromCenter(1.2)}
          title="Zoom In"
          className="p-2 hover:bg-surface-hover dark:hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => zoomFromCenter(1 / 1.2)}
          title="Zoom Out"
          className="p-2 hover:bg-surface-hover dark:hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={recenter}
          title="Recenter Graph"
          className="p-2 hover:bg-surface-hover dark:hover:bg-slate-800 rounded-lg hover:text-indigo-400 transition-colors"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-bold px-2 text-slate-300">
          {Math.round(viewport.zoom * 100)}%
        </span>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-label="Knowledge graph. Arrow keys pan, plus and minus zoom, square brackets move between nodes, Enter opens a note."
        data-testid="graph-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          if (hoveredNodeRef.current) {
            hoveredNodeRef.current = null;
            requestFrame();
          }
        }}
        onKeyDown={handleKeyDown}
        // touch-action: none stops the browser claiming the gesture for scrolling or page zoom.
        style={{ touchAction: 'none' }}
        className="w-full h-full cursor-grab active:cursor-grabbing select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      />
    </div>
  );
};
