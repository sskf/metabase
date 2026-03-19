import { useNodesInitialized, useReactFlow } from "@xyflow/react";
import { useLayoutEffect, useRef } from "react";

import type { SchemaViewerFlowNode } from "../types";
import { getNodesWithPositions } from "../utils";

function getNodeSetKey(nodes: SchemaViewerFlowNode[]): string {
  return nodes
    .map(
      (n) =>
        `${n.id}:${Math.round(n.position.x)}:${Math.round(n.position.y)}:${n.style?.opacity ?? 1}`,
    )
    .sort()
    .join(",");
}

function hasUnpositionedNodes(nodes: SchemaViewerFlowNode[]): boolean {
  return nodes.some(
    (node) =>
      (node.position.x === 0 && node.position.y === 0) ||
      node.style?.opacity === 0,
  );
}

export function SchemaViewerNodeLayout() {
  const { getNodes, getEdges, setNodes, fitView } =
    useReactFlow<SchemaViewerFlowNode>();
  const isInitialized = useNodesInitialized();
  const prevNodeSetKeyRef = useRef<string | null>(null);
  const positionedNodesRef = useRef<Map<string, { x: number; y: number }>>(
    new Map(),
  );

  useLayoutEffect(() => {
    if (isInitialized) {
      const nodes = getNodes();
      const currentNodeSetKey = getNodeSetKey(nodes);

      if (
        prevNodeSetKeyRef.current !== currentNodeSetKey ||
        hasUnpositionedNodes(nodes)
      ) {
        prevNodeSetKeyRef.current = currentNodeSetKey;
        const edges = getEdges();

        // Pass existing positions so previously-positioned nodes stay in place
        const existingPositions = positionedNodesRef.current;
        const newNodes = getNodesWithPositions(nodes, edges, existingPositions);

        // Update the position cache with all current node positions
        const updatedPositions = new Map<string, { x: number; y: number }>();
        for (const node of newNodes) {
          updatedPositions.set(node.id, node.position);
        }
        positionedNodesRef.current = updatedPositions;

        setNodes(newNodes);

        // Focus on newly-added nodes (FK expansion), or fit all (initial load)
        const newlyAdded = newNodes.filter((n) => !existingPositions.has(n.id));
        if (newlyAdded.length > 0 && newlyAdded.length < newNodes.length) {
          fitView({ nodes: newlyAdded, duration: 300, padding: 0.5 });
        } else {
          fitView({ nodes: newNodes });
        }
      }
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
