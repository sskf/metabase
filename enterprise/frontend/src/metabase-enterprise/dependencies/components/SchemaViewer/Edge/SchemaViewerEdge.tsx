import {
  type EdgeProps,
  getSmoothStepPath,
  useNodesInitialized,
} from "@xyflow/react";
import { memo, useMemo } from "react";

import { usePalette } from "metabase/common/hooks/use-palette";

import type { SchemaViewerEdgeData, SchemaViewerFlowEdge } from "../types";

// Crow's foot geometry constants
const GAP = 4;
const W = 8;
const H = 6;

type SymbolType = "one" | "many";

type SymbolProps = {
  x: number;
  y: number;
  stroke: string;
};

function OneSourceSymbol({ x, y, stroke }: SymbolProps) {
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x + GAP}
      y1={y - H}
      x2={x + GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function ManySourceSymbol({ x, y, stroke }: SymbolProps) {
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x + GAP + W}
        y1={y}
        x2={x + GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </>
  );
}

function OneTargetSymbol({ x, y, stroke }: SymbolProps) {
  return (
    <line
      data-testid="schema-viewer-edge-symbol-line"
      x1={x - GAP}
      y1={y - H}
      x2={x - GAP}
      y2={y + H}
      stroke={stroke}
      strokeWidth={1.5}
    />
  );
}

function ManyTargetSymbol({ x, y, stroke }: SymbolProps) {
  return (
    <>
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y - H}
        stroke={stroke}
        strokeWidth={1.5}
      />
      <line
        data-testid="schema-viewer-edge-symbol-line"
        x1={x - GAP - W}
        y1={y}
        x2={x - GAP}
        y2={y + H}
        stroke={stroke}
        strokeWidth={1.5}
      />
    </>
  );
}

function getSymbolTypes(relationship: SchemaViewerEdgeData["relationship"]): {
  source: SymbolType;
  target: SymbolType;
} {
  if (relationship === "one-to-one") {
    return { source: "one", target: "one" };
  }
  return { source: "many", target: "one" };
}

type SymbolWrapperProps = {
  type: SymbolType;
  x: number;
  y: number;
  stroke: string;
};

function SourceSymbol({ type, x, y, stroke }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManySourceSymbol x={x} y={y} stroke={stroke} />
  ) : (
    <OneSourceSymbol x={x} y={y} stroke={stroke} />
  );
}

function TargetSymbol({ type, x, y, stroke }: SymbolWrapperProps) {
  return type === "many" ? (
    <ManyTargetSymbol x={x} y={y} stroke={stroke} />
  ) : (
    <OneTargetSymbol x={x} y={y} stroke={stroke} />
  );
}

export const SchemaViewerEdge = memo(function SchemaViewerEdge(
  props: EdgeProps<SchemaViewerFlowEdge>,
) {
  const palette = usePalette();
  const isInitialized = useNodesInitialized();
  const isSelfRef = props.source === props.target;
  const isHidden = !isInitialized;
  const animationClass = "schema-viewer-edge-march";

  const relationship = props.data?.relationship ?? "many-to-one";
  const symbols = useMemo(() => getSymbolTypes(relationship), [relationship]);
  const stroke = palette["border"] ?? "currentColor";

  const style = useMemo(
    () => ({
      strokeWidth: 1.5,
      stroke,
      ...(isHidden ? { visibility: "hidden" as const } : {}),
    }),
    [stroke, isHidden],
  );

  let edgePath: string;

  if (isSelfRef) {
    const { sourceX, sourceY, targetX, targetY } = props;
    const offset = 50;
    const r = 8;
    const midX = Math.max(sourceX, targetX) + offset;

    edgePath = [
      `M ${sourceX} ${sourceY}`,
      `L ${midX - r} ${sourceY}`,
      `Q ${midX} ${sourceY} ${midX} ${sourceY + (sourceY < targetY ? r : -r)}`,
      `L ${midX} ${targetY + (sourceY < targetY ? -r : r)}`,
      `Q ${midX} ${targetY} ${midX - r} ${targetY}`,
      `L ${targetX} ${targetY}`,
    ].join(" ");
  } else {
    [edgePath] = getSmoothStepPath({
      sourceX: props.sourceX,
      sourceY: props.sourceY,
      sourcePosition: props.sourcePosition,
      targetX: props.targetX,
      targetY: props.targetY,
      targetPosition: props.targetPosition,
    });
  }

  return (
    <>
      <path
        data-testid="schema-viewer-edge-path"
        d={edgePath}
        fill="none"
        style={style}
        className={`react-flow__edge-path ${animationClass}`}
      />
      {!isHidden && (
        <g data-testid="schema-viewer-edge-symbols">
          <SourceSymbol
            type={symbols.source}
            x={props.sourceX}
            y={props.sourceY}
            stroke={stroke}
          />
          {isSelfRef ? (
            <SourceSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
            />
          ) : (
            <TargetSymbol
              type={symbols.target}
              x={props.targetX}
              y={props.targetY}
              stroke={stroke}
            />
          )}
        </g>
      )}
    </>
  );
});
