import { Note } from '../domain/note';
import { GraphData, GraphNode, GraphEdge, GraphFilterConfig } from '../domain/graph';
import { extractWikilinks, resolveWikilinks } from '../markdown/wikilinks';

const FOLDER_COLORS: Record<string, string> = {
  Research: '#8b5cf6', // purple
  Guides: '#10b981',   // emerald
  'Daily Notes': '#f59e0b', // amber
  Architecture: '#f43f5e', // rose
  General: '#6366f1',  // indigo
  Engineering: '#06b6d4', // cyan
  'Getting Started': '#6366f1',
};

/**
 * Palette used for tag colouring and tag nodes. Kept in one place so the
 * node colour and the "Color by Tag" mode never drift apart.
 */
const TAG_HUES = ['#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#06b6d4', '#ec4899'];

export function hashTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) hash += tag.charCodeAt(i);
  return TAG_HUES[hash % TAG_HUES.length];
}

/** Stable identifier for a tag node. Tag names are case-insensitive. */
export function tagNodeId(tag: string): string {
  return `tag:${tag.trim().toLowerCase()}`;
}

interface TagEntry {
  id: string;
  label: string;
  color: string;
  noteCount: number;
}

/**
 * Collects the tags of the currently visible notes. Notes that were filtered
 * out by search or by the tag filter do not contribute tag nodes.
 */
function collectVisibleTags(notes: Note[], visibleNoteIds: Set<string>): Map<string, TagEntry> {
  const tags = new Map<string, TagEntry>();

  for (const note of notes) {
    if (!visibleNoteIds.has(note.id)) continue;

    for (const rawTag of note.tags) {
      const trimmed = rawTag.trim();
      if (!trimmed) continue;

      const id = tagNodeId(trimmed);
      const existing = tags.get(id);
      if (existing) {
        existing.noteCount += 1;
      } else {
        tags.set(id, {
          id,
          label: `#${trimmed}`,
          color: hashTagColor(trimmed.toLowerCase()),
          noteCount: 1,
        });
      }
    }
  }

  return tags;
}

/**
 * Builds the graph dataset (nodes and edges) from the current list of notes.
 */
export function buildGraphData(
  notes: Note[],
  filterConfig: GraphFilterConfig
): GraphData {
  const nodesMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  const edgeSet = new Set<string>();

  // 1. Initialize note nodes
  for (const note of notes) {
    if (filterConfig.searchFilter) {
      const q = filterConfig.searchFilter.toLowerCase();
      if (!note.title.toLowerCase().includes(q) && !note.content.toLowerCase().includes(q)) {
        continue;
      }
    }

    if (filterConfig.tagFilter && !note.tags.includes(filterConfig.tagFilter)) {
      continue;
    }

    let nodeColor = '#6366f1';
    if (filterConfig.colorMode === 'folder') {
      const folderKey = note.folder || 'General';
      nodeColor = FOLDER_COLORS[folderKey] || '#6366f1';
    } else if (filterConfig.colorMode === 'tag' && note.tags.length > 0) {
      nodeColor = hashTagColor(note.tags[0].trim().toLowerCase());
    }

    nodesMap.set(note.id, {
      id: note.id,
      label: note.title,
      type: 'note',
      tags: note.tags,
      folder: note.folder || 'General',
      connectionsCount: 0,
      isOrphan: true,
      color: nodeColor,
      radius: 9,
    });
  }

  const visibleNoteIds = new Set(nodesMap.keys());

  // 2. Extract and resolve wikilinks for each note + linkedNoteIds
  for (const note of notes) {
    if (!nodesMap.has(note.id)) continue;

    const rawLinks = extractWikilinks(note.content, note.id);

    // Support linkedNoteIds even when text in textbox is clean
    if (note.linkedNoteIds) {
      for (const linkedId of note.linkedNoteIds) {
        if (linkedId === note.id) continue;

        const target = notes.find(n => n.id === linkedId);
        if (target && !rawLinks.some(l => l.targetTitle.toLowerCase() === target.title.toLowerCase())) {
          rawLinks.push({
            sourceNoteId: note.id,
            targetTitle: target.title,
            targetNoteId: target.id,
            rawText: `[[${target.title}]]`,
          });
        }
      }
    }

    const resolvedLinks = resolveWikilinks(rawLinks, notes);

    for (const link of resolvedLinks) {
      // A note referencing itself is not a relationship; skipping it keeps the
      // orphan flag and the radius meaningful.
      if (link.targetNoteId === note.id) continue;

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
        let missingNode = nodesMap.get(missingNodeId);
        if (!missingNode) {
          missingNode = {
            id: missingNodeId,
            label: link.targetTitle,
            type: 'missing',
            tags: [],
            connectionsCount: 0,
            isOrphan: false,
            color: '#f59e0b',
            radius: 7,
          };
          nodesMap.set(missingNodeId, missingNode);
        }

        const edgeId = `${note.id}->${missingNodeId}`;
        if (!edgeSet.has(edgeId)) {
          edgeSet.add(edgeId);
          edges.push({
            id: edgeId,
            source: note.id,
            target: missingNodeId,
          });

          // Every distinct source grows the missing node, otherwise its radius
          // stays at the minimum no matter how many notes point at it.
          missingNode.connectionsCount += 1;

          const sourceNode = nodesMap.get(note.id);
          if (sourceNode) {
            sourceNode.connectionsCount += 1;
            sourceNode.isOrphan = false;
          }
        }
      }
    }
  }

  // 3. Tag nodes. Tags are metadata, not note relationships, so tag edges do
  // not touch connectionsCount or isOrphan on the note nodes.
  if (filterConfig.showTags) {
    const visibleTags = collectVisibleTags(notes, visibleNoteIds);

    for (const tag of visibleTags.values()) {
      nodesMap.set(tag.id, {
        id: tag.id,
        label: tag.label,
        type: 'tag',
        tags: [tag.label.slice(1)],
        connectionsCount: tag.noteCount,
        isOrphan: false,
        color: tag.color,
        radius: 7,
      });
    }

    for (const note of notes) {
      if (!nodesMap.has(note.id)) continue;

      for (const rawTag of note.tags) {
        const trimmed = rawTag.trim();
        if (!trimmed) continue;

        const tagId = tagNodeId(trimmed);
        if (!nodesMap.has(tagId)) continue;

        const edgeId = `${note.id}->${tagId}`;
        if (edgeSet.has(edgeId)) continue;

        edgeSet.add(edgeId);
        edges.push({
          id: edgeId,
          source: note.id,
          target: tagId,
          label: 'tag',
        });
      }
    }
  }

  // 4. Filter orphan notes if toggle is off
  let nodes = Array.from(nodesMap.values());
  if (!filterConfig.showOrphans) {
    nodes = nodes.filter(n => !n.isOrphan);
  }

  // Drop edges that lost an endpoint, then prune tag nodes that are no longer
  // attached to a visible note so the canvas shows no floating dots.
  const visibleIds = new Set(nodes.map(n => n.id));
  const visibleEdges = edges.filter(e => visibleIds.has(e.source) && visibleIds.has(e.target));
  const linkedTagIds = new Set(
    visibleEdges.filter(e => e.label === 'tag').map(e => e.target)
  );
  nodes = nodes.filter(n => n.type !== 'tag' || linkedTagIds.has(n.id));

  nodes.forEach(n => {
    if (n.type === 'tag') {
      n.radius = Math.min(15, Math.max(6, 6 + n.connectionsCount * 1.2));
      return;
    }
    n.radius = Math.min(20, Math.max(7, 7 + n.connectionsCount * 2.5));
  });

  return { nodes, edges: visibleEdges };
}
