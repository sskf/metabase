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
        const newNodes = getNodesWithPositions(nodes, edges);
        setNodes(newNodes);
        fitView({ nodes: newNodes });
      }
    }
  }, [isInitialized, getNodes, getEdges, setNodes, fitView]);

  return null;
}
