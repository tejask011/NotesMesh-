import { Note } from '../domain/note';
import { GraphData, GraphNode, GraphEdge, GraphFilterConfig } from '../domain/graph';
import { buildTitleIndex, extractWikilinks, resolveWikilinks } from '../markdown/wikilinks';
import { getEffectiveTags, noteHasTag } from '../notes/tags';
import { normalizeFolderPath } from '../notes/folders';

const FOLDER_COLORS: Record<string, string> = {
  Research: '#8b5cf6', // purple
  Guides: '#10b981', // emerald
  'Daily Notes': '#f59e0b', // amber
  Architecture: '#f43f5e', // rose
  General: '#6366f1', // indigo
  Engineering: '#06b6d4', // cyan
  'Getting Started': '#6366f1',
};

const COLOR_HUES = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'];

function hashColor(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash += value.charCodeAt(i);
  return COLOR_HUES[hash % COLOR_HUES.length];
}

/**
 * Keep only nodes within `maxDepth` links of the focus node (breadth-first, ignoring edge direction).
 */
export function applyConnectionDepth(
  data: GraphData,
  focusNodeId: string,
  maxDepth: number
): GraphData {
  if (!data.nodes.some(node => node.id === focusNodeId)) return data;

  const neighbors = new Map<string, string[]>();
  const link = (from: string, to: string) => {
    const list = neighbors.get(from);
    if (list) list.push(to);
    else neighbors.set(from, [to]);
  };
  for (const edge of data.edges) {
    link(edge.source, edge.target);
    link(edge.target, edge.source);
  }

  const visible = new Set([focusNodeId]);
  let frontier = [focusNodeId];
  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors.get(id) ?? []) {
        if (!visible.has(neighbor)) {
          visible.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }

  return {
    nodes: data.nodes.filter(node => visible.has(node.id)),
    edges: data.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)),
  };
}

/**
 * Builds the graph dataset (nodes and edges) from the current list of notes.
 */
export function buildGraphData(notes: Note[], filterConfig: GraphFilterConfig): GraphData {
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();
  const titleIndex = buildTitleIndex(notes);
  const notesById = new Map(notes.map(note => [note.id, note]));

  // 1. Initialize note nodes
  for (const note of notes) {
    if (filterConfig.searchFilter) {
      const q = filterConfig.searchFilter.toLowerCase();
      if (!note.title.toLowerCase().includes(q) && !note.content.toLowerCase().includes(q)) {
        continue;
      }
    }

    if (filterConfig.tagFilter && !noteHasTag(note, filterConfig.tagFilter)) {
      continue;
    }

    const noteTags = getEffectiveTags(note);
    const folderPath = normalizeFolderPath(note.folder);

    let nodeColor = '#6366f1';
    if (filterConfig.colorMode === 'folder') {
      // Nested folders take the color of their top-level folder.
      const topLevel = folderPath.split('/')[0];
      nodeColor = FOLDER_COLORS[topLevel] || hashColor(topLevel);
    } else if (filterConfig.colorMode === 'tag' && noteTags.length > 0) {
      nodeColor = hashColor(noteTags[0]);
    }

    nodesMap.set(note.id, {
      id: note.id,
      label: note.title || 'Untitled',
      type: 'note',
      tags: noteTags,
      folder: folderPath,
      connectionsCount: 0,
      isOrphan: true,
      color: nodeColor,
      radius: 9,
    });
  }

  // 2. Extract and resolve wikilinks for each note + linkedNoteIds
  for (const note of notes) {
    if (!nodesMap.has(note.id)) continue;

    const rawLinks = extractWikilinks(note.content, note.id);

    // Support linkedNoteIds even when text in textbox is clean
    if (note.linkedNoteIds) {
      for (const linkedId of note.linkedNoteIds) {
        const target = notesById.get(linkedId);
        if (
          target &&
          !rawLinks.some(l => l.targetTitle.toLowerCase() === target.title.toLowerCase())
        ) {
          rawLinks.push({
            sourceNoteId: note.id,
            targetTitle: target.title,
            targetNoteId: target.id,
            rawText: `[[${target.title}]]`,
          });
        }
      }
    }

    const resolvedLinks = resolveWikilinks(rawLinks, notes, titleIndex);

    for (const link of resolvedLinks) {
      if (link.targetNoteId && nodesMap.has(link.targetNoteId)) {
        const edgeId = `${note.id}->${link.targetNoteId}`;
        const reverseEdgeId = `${link.targetNoteId}->${note.id}`;

        if (!edgeSet.has(edgeId) && !edgeSet.has(reverseEdgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: note.id,
            target: link.targetNoteId,
          });

          const sourceNode = nodesMap.get(note.id);
          const targetNode = nodesMap.get(link.targetNoteId);
          if (sourceNode) {
            sourceNode.connectionsCount += 1;
            sourceNode.isOrphan = false;
          }
          if (targetNode) {
            targetNode.connectionsCount += 1;
            targetNode.isOrphan = false;
          }
        }
      } else if (!link.targetNoteId && filterConfig.showMissingLinks) {
        const missingNodeId = `missing:${link.targetTitle.toLowerCase()}`;
        if (!nodesMap.has(missingNodeId)) {
          nodesMap.set(missingNodeId, {
            id: missingNodeId,
            label: link.targetTitle,
            type: 'missing',
            tags: [],
            connectionsCount: 0,
            isOrphan: false,
            color: '#f59e0b',
            radius: 7,
          });
        }

        const edgeId = `${note.id}->${missingNodeId}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: note.id,
            target: missingNodeId,
          });

          const sourceNode = nodesMap.get(note.id);
          if (sourceNode) {
            sourceNode.connectionsCount += 1;
            sourceNode.isOrphan = false;
          }
          (nodesMap.get(missingNodeId) as GraphNode).connectionsCount += 1;
        }
      }
    }
  }

  // 3. Filter orphan notes if toggle is off
  let nodes = Array.from(nodesMap.values());
  if (!filterConfig.showOrphans) {
    nodes = nodes.filter(n => !n.isOrphan);
  }

  nodes.forEach(n => {
    n.radius = Math.min(20, Math.max(7, 7 + n.connectionsCount * 2.5));
  });

  const data = { nodes, edges };
  const { focusNodeId, maxDepth } = filterConfig;
  return focusNodeId && maxDepth ? applyConnectionDepth(data, focusNodeId, maxDepth) : data;
}
