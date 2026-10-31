/**
 * Knowledge Graph Domain Models
 */

export interface GraphNode {
  id: string; // note ID or missing note target
  label: string;
  type: 'note' | 'missing' | 'tag' | 'canvas';
  tags: string[];
  folder?: string;
  connectionsCount: number;
  isOrphan: boolean;
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  radius?: number;
  color?: string;
}

export interface GraphEdge {
  id: string;
  source: string; // node ID
  target: string; // node ID
  label?: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface GraphFilterConfig {
  showTags: boolean;
  showOrphans: boolean;
  showMissingLinks: boolean;
  searchFilter: string;
  tagFilter: string | null;
  colorMode: 'type' | 'folder' | 'tag';
  linkDistance: number;
  repelForce: number;
  collisionRadius: number;
  focusNodeId?: string | null;
  /** Only show nodes within this many links of the focus node; null shows everything. */
  maxDepth?: number | null;
}
