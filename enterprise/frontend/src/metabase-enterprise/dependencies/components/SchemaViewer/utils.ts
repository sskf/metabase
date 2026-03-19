import dagre from "@dagrejs/dagre";
import { memoize } from "underscore";

import { isTypeFK, isTypePK } from "metabase-lib/v1/types/utils/isa";
import type {
  ErdEdge,
  ErdField,
  ErdNode,
  ErdResponse,
  TableId,
} from "metabase-types/api";

import {
  DAGRE_NODE_SEP,
  DAGRE_RANK_SEP,
  HEADER_HEIGHT,
  NODE_WIDTH,
  ROW_HEIGHT,
} from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";

function sortFields(fields: ErdField[]): ErdField[] {
  return [...fields].sort((a, b) => {
    const aPK = isTypePK(a.semantic_type);
    const bPK = isTypePK(b.semantic_type);
    const aFK = isTypeFK(a.semantic_type);
    const bFK = isTypeFK(b.semantic_type);

    // PK first
    if (aPK && !bPK) {
      return -1;
    }
    if (!aPK && bPK) {
      return 1;
    }
    // FK second
    if (aFK && !bFK) {
      return -1;
    }
    if (!aFK && bFK) {
      return 1;
    }
    // Keep original order for same category
    return 0;
  });
}

export function getNodeId(node: { table_id: TableId }): string {
  return `table-${node.table_id}`;
}

function getNodeHeight(node: ErdNode): number {
  return HEADER_HEIGHT + node.fields.length * ROW_HEIGHT;
}

function toFlowNode(
  node: ErdNode,
  connectedFieldIds: Set<number>,
): SchemaViewerFlowNode {
  return {
    id: getNodeId(node),
    type: "schemaViewerTable",
    position: { x: 0, y: 0 },
    data: { ...node, fields: sortFields(node.fields), connectedFieldIds },
    style: {
      width: NODE_WIDTH,
      height: getNodeHeight(node),
      opacity: 0, // Hide until positioned by dagre layout
    },
  };
}

function toFlowEdge(edge: ErdEdge): SchemaViewerFlowEdge {
  const isSelfRef = edge.source_table_id === edge.target_table_id;
  return {
    id: `edge-${edge.source_field_id}-${edge.target_field_id}`,
    source: `table-${edge.source_table_id}`,
    target: `table-${edge.target_table_id}`,
    sourceHandle: `field-${edge.source_field_id}`,
    targetHandle: isSelfRef
      ? `field-${edge.target_field_id}-right`
      : `field-${edge.target_field_id}`,
    type: "schemaViewerEdge",
    data: {
      relationship: edge.relationship,
    },
  };
}

function getFlowGraphMemoKey(data: ErdResponse): string {
  const nodeKey = data.nodes
    .map((node) => {
      const fieldKey = node.fields
        .map(
          (field) =>
            `${field.id}:${field.semantic_type ?? ""}:${field.fk_target_field_id ?? ""}`,
        )
        .join("|");
      return `${node.table_id}:${fieldKey}`;
    })
    .sort()
    .join(";");

  const edgeKey = data.edges
    .map(
      (edge) =>
        `${edge.source_table_id}:${edge.source_field_id}->${edge.target_table_id}:${edge.target_field_id}:${edge.relationship}`,
    )
    .sort()
    .join(";");

  return `${nodeKey}__${edgeKey}`;
}

const memoizedToFlowGraph = memoize((data: ErdResponse) => {
  // Build a map of table_id -> set of field IDs that have edges
  const connectedByTable = new Map<TableId, Set<number>>();
  for (const edge of data.edges) {
    if (!connectedByTable.has(edge.source_table_id)) {
      connectedByTable.set(edge.source_table_id, new Set());
    }
    if (!connectedByTable.has(edge.target_table_id)) {
      connectedByTable.set(edge.target_table_id, new Set());
    }
    connectedByTable.get(edge.source_table_id)!.add(edge.source_field_id);
    connectedByTable.get(edge.target_table_id)!.add(edge.target_field_id);
  }

  const emptySet = new Set<number>();
  return {
    nodes: data.nodes.map((node) =>
      toFlowNode(node, connectedByTable.get(node.table_id) ?? emptySet),
    ),
    edges: data.edges.map((edge) => toFlowEdge(edge)),
  };
}, getFlowGraphMemoKey);

export function toFlowGraph(data: ErdResponse): {
  nodes: SchemaViewerFlowNode[];
  edges: SchemaViewerFlowEdge[];
} {
  return memoizedToFlowGraph(data);
}

function getLayoutNodeHeight(node: SchemaViewerFlowNode): number {
  const fieldCount = node.data.fields?.length ?? 0;
  return HEADER_HEIGHT + fieldCount * ROW_HEIGHT;
}

type Rect = { x: number; y: number; w: number; h: number };

function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.w + gap &&
    a.x + a.w + gap > b.x &&
    a.y < b.y + b.h + gap &&
    a.y + a.h + gap > b.y
  );
}

/**
 * Shift a rect so it no longer overlaps any rect in `placed`.
 * Tries moving right first, then down, in `gap`-sized steps.
 */
function resolveOverlap(rect: Rect, placed: Rect[], gap: number): Rect {
  const overlaps = () => placed.some((p) => rectsOverlap(rect, p, gap));
  // Try shifting right in small increments
  for (let attempt = 0; attempt < 20 && overlaps(); attempt++) {
    rect = { ...rect, x: rect.x + rect.w + gap };
  }
  return rect;
}

/**
 * Compute positions for flow nodes using dagre layout.
 *
 * When `existingPositions` is provided, nodes that already have positions
 * are kept in place and only newly-added nodes receive dagre-computed positions.
 * New nodes are shifted if they would overlap with any existing node.
 */
export function getNodesWithPositions(
  nodes: SchemaViewerFlowNode[],
  edges: { source: string; target: string }[],
  existingPositions?: Map<string, { x: number; y: number }>,
): SchemaViewerFlowNode[] {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setGraph({
    rankdir: "LR",
    nodesep: DAGRE_NODE_SEP,
    ranksep: DAGRE_RANK_SEP,
  });
  dagreGraph.setDefaultEdgeLabel(() => ({}));

  nodes.forEach((node) => {
    const height = getLayoutNodeHeight(node);
    dagreGraph.setNode(node.id, {
      width: NODE_WIDTH,
      height,
    });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  // First pass: assign positions (cached or dagre-computed)
  const positioned = nodes.map((node) => {
    const existing = existingPositions?.get(node.id);
    const { width, height } = dagreGraph.node(node.id);
    const isNew = existing == null;
    const position = isNew
      ? {
          x: dagreGraph.node(node.id).x - width / 2,
          y: dagreGraph.node(node.id).y - height / 2,
        }
      : existing;

    return { node, position, width, height, isNew };
  });

  // Second pass: resolve overlaps for new nodes against all placed nodes
  if (existingPositions != null && existingPositions.size > 0) {
    const placedRects: Rect[] = positioned
      .filter((p) => !p.isNew)
      .map((p) => ({
        x: p.position.x,
        y: p.position.y,
        w: p.width,
        h: p.height,
      }));

    for (const entry of positioned) {
      if (entry.isNew) {
        let rect: Rect = {
          x: entry.position.x,
          y: entry.position.y,
          w: entry.width,
          h: entry.height,
        };
        rect = resolveOverlap(rect, placedRects, DAGRE_NODE_SEP);
        entry.position = { x: rect.x, y: rect.y };
        placedRects.push(rect);
      }
    }
  }

  return positioned.map(({ node, position, width, height }) => ({
    ...node,
    position,
    style: {
      ...node.style,
      width,
      height,
      opacity: 1,
    },
  }));
}
