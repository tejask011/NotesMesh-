import { GraphEdge, GraphNode } from '../domain/graph';

export interface SimulationParams {
  repelForce: number;
  linkDistance: number;
  collisionRadius: number;
  /** A node held by the user: it exerts forces but isn't moved by them. */
  pinnedNodeId?: string | null;
  /** Layout "temperature" from 1 down to 0: how far this tick's forces can move nodes. */
  alpha?: number;
}

/**
 * Force layouts jitter indefinitely rather than coming to rest, so movement is
 * scaled by a temperature that cools each tick. This guarantees the animation
 * stops, and with it the CPU use; anything that changes the layout reheats it.
 */
export const ALPHA_DECAY = 0.99;
export const ALPHA_MIN = 0.02;

const DAMPING = 0.88;
const SPRING_STRENGTH = 0.04;
const GRAVITY = 0.003;
const COLLISION_STRENGTH = 0.25;
/** Barnes-Hut accuracy: a distant cell is approximated if size/distance is below this. */
const THETA = 0.9;
const MAX_TREE_DEPTH = 24;
/** Repulsion stops growing inside this distance, so overlapping nodes aren't launched. */
const MIN_FORCE_DISTANCE_SQ = 400;
const MAX_SPEED = 30;

interface QuadCell {
  x: number;
  y: number;
  half: number;
  mass: number;
  comX: number;
  comY: number;
  /** A leaf holds one node; coincident nodes past the depth limit share a leaf. */
  node: GraphNode | null;
  extra: GraphNode[] | null;
  children: (QuadCell | null)[] | null;
}

const createCell = (x: number, y: number, half: number): QuadCell => ({
  x,
  y,
  half,
  mass: 0,
  comX: 0,
  comY: 0,
  node: null,
  extra: null,
  children: null,
});

function insert(cell: QuadCell, node: GraphNode, depth: number): void {
  const px = node.x as number;
  const py = node.y as number;
  cell.comX = (cell.comX * cell.mass + px) / (cell.mass + 1);
  cell.comY = (cell.comY * cell.mass + py) / (cell.mass + 1);
  cell.mass += 1;

  if (!cell.children) {
    if (!cell.node) {
      cell.node = node;
      return;
    }
    if (depth >= MAX_TREE_DEPTH) {
      (cell.extra ??= []).push(node);
      return;
    }
    const existing = cell.node;
    cell.node = null;
    cell.children = [null, null, null, null];
    insertIntoChild(cell, existing, depth);
  }
  insertIntoChild(cell, node, depth);
}

function insertIntoChild(cell: QuadCell, node: GraphNode, depth: number): void {
  const right = (node.x as number) >= cell.x;
  const bottom = (node.y as number) >= cell.y;
  const index = (right ? 1 : 0) + (bottom ? 2 : 0);
  const children = cell.children as (QuadCell | null)[];
  let child = children[index];
  if (!child) {
    const half = cell.half / 2;
    child = createCell(cell.x + (right ? half : -half), cell.y + (bottom ? half : -half), half);
    children[index] = child;
  }
  insert(child, node, depth + 1);
}

function applyTreeForces(cell: QuadCell, node: GraphNode, params: SimulationParams): void {
  const dx = (node.x as number) - cell.comX;
  const dy = (node.y as number) - cell.comY;
  const distSq = dx * dx + dy * dy;

  if (cell.children && (cell.half * 2) ** 2 < THETA * THETA * distSq) {
    const dist = Math.sqrt(distSq);
    const force = (params.repelForce * cell.mass) / Math.max(distSq, MIN_FORCE_DISTANCE_SQ);
    node.vx = (node.vx ?? 0) + (dx / dist) * force;
    node.vy = (node.vy ?? 0) + (dy / dist) * force;
    return;
  }

  if (cell.children) {
    for (const child of cell.children) {
      if (child) applyTreeForces(child, node, params);
    }
    return;
  }

  if (cell.node) applyPairForce(node, cell.node, params);
  if (cell.extra) cell.extra.forEach(other => applyPairForce(node, other, params));
}

function applyPairForce(node: GraphNode, other: GraphNode, params: SimulationParams): void {
  if (node === other) return;
  let dx = (node.x as number) - (other.x as number);
  let dy = (node.y as number) - (other.y as number);
  let distSq = dx * dx + dy * dy;
  if (distSq === 0) {
    // Nudge coincident nodes apart deterministically, or they'd never separate.
    dx = 0.1 * (node.id < other.id ? 1 : -1);
    dy = 0.1;
    distSq = dx * dx + dy * dy;
  }
  const dist = Math.sqrt(distSq);
  let force = params.repelForce / Math.max(distSq, MIN_FORCE_DISTANCE_SQ);
  if (dist < params.collisionRadius) {
    force += (params.collisionRadius - dist) * COLLISION_STRENGTH;
  }
  node.vx = (node.vx ?? 0) + (dx / dist) * force;
  node.vy = (node.vy ?? 0) + (dy / dist) * force;
}

/**
 * Advance the force layout one tick in O(n log n), using a Barnes-Hut quadtree
 * for repulsion. Returns the total kinetic energy so the caller can tell
 * when the layout has come to rest.
 */
export function stepSimulation(
  nodes: GraphNode[],
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
  params: SimulationParams
): number {
  const placed = nodes.filter(node => node.x !== undefined && node.y !== undefined);
  if (placed.length === 0) return 0;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of placed) {
    minX = Math.min(minX, node.x as number);
    minY = Math.min(minY, node.y as number);
    maxX = Math.max(maxX, node.x as number);
    maxY = Math.max(maxY, node.y as number);
  }
  const half = Math.max(maxX - minX, maxY - minY, 1) / 2 + 1;
  const root = createCell((minX + maxX) / 2, (minY + maxY) / 2, half);
  for (const node of placed) insert(root, node, 0);

  for (const node of placed) applyTreeForces(root, node, params);

  // Spring attraction along edges
  for (const edge of edges) {
    const source = nodeMap.get(edge.source);
    const target = nodeMap.get(edge.target);
    if (!source || !target || source.x === undefined || target.x === undefined) continue;
    if (source.y === undefined || target.y === undefined) continue;

    const dx = target.x - source.x;
    const dy = target.y - source.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const force = (dist - params.linkDistance) * SPRING_STRENGTH;
    const fx = (dx / dist) * force;
    const fy = (dy / dist) * force;

    source.vx = (source.vx ?? 0) + fx;
    source.vy = (source.vy ?? 0) + fy;
    target.vx = (target.vx ?? 0) - fx;
    target.vy = (target.vy ?? 0) - fy;
  }

  // Center gravity, damping and integration
  const alpha = params.alpha ?? 1;
  let energy = 0;
  for (const node of placed) {
    if (node.id === params.pinnedNodeId) {
      node.vx = 0;
      node.vy = 0;
      continue;
    }
    node.vx = ((node.vx ?? 0) - (node.x as number) * GRAVITY) * DAMPING;
    node.vy = ((node.vy ?? 0) - (node.y as number) * GRAVITY) * DAMPING;

    const speed = Math.hypot(node.vx, node.vy);
    if (speed > MAX_SPEED) {
      node.vx *= MAX_SPEED / speed;
      node.vy *= MAX_SPEED / speed;
    }

    const dx = node.vx * alpha;
    const dy = node.vy * alpha;
    node.x = (node.x as number) + dx;
    node.y = (node.y as number) + dy;
    energy += dx * dx + dy * dy;
  }
  return energy;
}

/** Deterministic spiral seeding: scales with node count, unlike a fixed ring. */
export function seedPosition(index: number): { x: number; y: number } {
  const radius = 40 * Math.sqrt(index + 1);
  const angle = index * 2.399963; // golden angle
  return { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius };
}
