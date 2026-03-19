import { useClipboard } from "@mantine/hooks";
import {
  Background,
  Controls,
  Panel,
  ReactFlow,
  useEdgesState,
  useNodesState,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { getErrorMessage } from "metabase/api/utils/errors";
import type { EntityPickerProps } from "metabase/common/components/Pickers";
import * as Urls from "metabase/lib/urls";
import { AppSwitcher } from "metabase/nav/components/AppSwitcher";
import {
  ActionIcon,
  Box,
  Group,
  Icon,
  Loader,
  Stack,
  Text,
  Tooltip,
  useColorScheme,
} from "metabase/ui";
import { useGetErdQuery } from "metabase-enterprise/api";
import type {
  ConcreteTableId,
  DatabaseId,
  DependencyNode,
  ErdResponse,
  GetErdRequest,
  SearchModel,
  TableDependencyNodeData,
  TableId,
} from "metabase-types/api";

import type { PickerEntry } from "../DependencyGraph/GraphEntryInput";
import { GraphEntryInput } from "../DependencyGraph/GraphEntryInput";

import { SchemaViewerEdge } from "./Edge";
import { SchemaViewerNodeLayout } from "./NodeLayout";
import S from "./SchemaViewer.module.css";
import { SchemaViewerContext } from "./SchemaViewerContext";
import { SchemaViewerTableNode } from "./TableNode";
import { MAX_ZOOM, MIN_ZOOM } from "./constants";
import type { SchemaViewerFlowEdge, SchemaViewerFlowNode } from "./types";
import { useSchemaViewerShareUrl } from "./useSchemaViewerShareUrl";
import { toFlowGraph } from "./utils";

const NODE_TYPES = {
  schemaViewerTable: SchemaViewerTableNode,
};

const EDGE_TYPES = {
  schemaViewerEdge: SchemaViewerEdge,
};

const PRO_OPTIONS = {
  hideAttribution: true,
};

const TABLE_SEARCH_MODELS: SearchModel[] = ["table"];
const TABLE_PICKER_MODELS: EntityPickerProps["models"] = ["table"];

interface SchemaViewerProps {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  initialTableIds: ConcreteTableId[] | undefined;
}

function getErdQueryParams({
  databaseId,
  schema,
  selectedTableIds,
}: {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  selectedTableIds: ConcreteTableId[] | null;
}): GetErdRequest | typeof skipToken {
  if (
    databaseId == null ||
    selectedTableIds == null ||
    selectedTableIds.length === 0
  ) {
    return skipToken;
  }
  const params: GetErdRequest = {
    "database-id": databaseId,
    "table-ids": selectedTableIds,
  };
  if (schema != null) {
    params.schema = schema;
  }
  return params;
}

function buildEntryNode(
  data: ErdResponse,
  databaseId: DatabaseId,
): DependencyNode | null {
  const focal = data.nodes.find((n) => n.is_focal);
  if (!focal) {
    return null;
  }
  return {
    id: Number(focal.table_id),
    type: "table",
    data: {
      name: focal.name,
      display_name: focal.display_name,
      db_id: databaseId,
      schema: focal.schema,
    } as TableDependencyNodeData,
  };
}

export function SchemaViewer({
  databaseId,
  schema,
  initialTableIds,
}: SchemaViewerProps) {
  // Keep selected table IDs for FK expansion
  const [selectedTableIds, setSelectedTableIds] = useState<
    ConcreteTableId[] | null
  >(() => {
    if (initialTableIds != null && initialTableIds.length > 0) {
      return initialTableIds;
    }
    return null;
  });

  // Sync selectedTableIds when URL-driven props change (navigation via GraphEntryInput)
  const currentContextKey =
    databaseId != null ? `${databaseId}:${schema ?? ""}` : null;
  const prevContextKeyRef = useRef(currentContextKey);
  const prevInitialTableIdsRef = useRef(initialTableIds);
  if (
    prevContextKeyRef.current !== currentContextKey ||
    prevInitialTableIdsRef.current !== initialTableIds
  ) {
    prevContextKeyRef.current = currentContextKey;
    prevInitialTableIdsRef.current = initialTableIds;
    setSelectedTableIds(
      initialTableIds != null && initialTableIds.length > 0
        ? initialTableIds
        : null,
    );
  }

  const { data, isFetching, error } = useGetErdQuery(
    getErdQueryParams({
      databaseId,
      schema,
      selectedTableIds,
    }),
  );

  const [nodes, setNodes, onNodesChange] = useNodesState<SchemaViewerFlowNode>(
    [],
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<SchemaViewerFlowEdge>(
    [],
  );
  const { colorScheme } = useColorScheme();
  const hasEntry = databaseId != null;

  // Set of currently visible table IDs on the canvas
  const visibleTableIds = useMemo(
    () => new Set(nodes.map((n) => n.data.table_id)),
    [nodes],
  );

  // Handler for expanding to a related table via FK click
  const handleExpandToTable = useCallback(
    (tableId: TableId) => {
      if (selectedTableIds != null) {
        setSelectedTableIds([...selectedTableIds, tableId as ConcreteTableId]);
      }
    },
    [selectedTableIds],
  );

  const shareUrl = useSchemaViewerShareUrl({
    databaseId,
    schema,
    tableIds: selectedTableIds,
  });
  const clipboard = useClipboard({ timeout: 2000 });

  const handleShare = useCallback(() => {
    if (shareUrl != null) {
      clipboard.copy(shareUrl);
    }
  }, [clipboard, shareUrl]);

  const schemaViewerContextValue = useMemo(
    () => ({
      visibleTableIds,
      onExpandToTable: handleExpandToTable,
    }),
    [visibleTableIds, handleExpandToTable],
  );

  const graph = useMemo(() => {
    if (data == null) {
      return null;
    }
    return toFlowGraph(data);
  }, [data]);

  useEffect(() => {
    if (!hasEntry || error != null) {
      setNodes([]);
      setEdges([]);
    } else if (!isFetching && graph != null) {
      setNodes(graph.nodes);
      setEdges(graph.edges);
    }
  }, [hasEntry, graph, error, isFetching, setNodes, setEdges]);

  // Build entry node for GraphEntryInput (only when not on shared link)
  const entryNode = useMemo<DependencyNode | null>(() => {
    if (data == null || databaseId == null) {
      return null;
    }
    return buildEntryNode(data, databaseId);
  }, [data, databaseId]);

  const getGraphUrl = useCallback(
    (entry: PickerEntry | undefined): string => {
      if (entry == null) {
        return Urls.dataStudioErdBase();
      }

      // DatabaseEntry from picker
      if ("type" in entry && entry.type === "database") {
        return Urls.dataStudioErdDatabase(entry.id as DatabaseId);
      }

      // SchemaEntry from picker
      if ("type" in entry && entry.type === "schema" && "databaseId" in entry) {
        return Urls.dataStudioErdSchema(
          (entry as { databaseId: DatabaseId }).databaseId,
          (entry as { schema: string }).schema,
        );
      }

      // DependencyEntry (table from search)
      // Include database-id when known to avoid round-trip table lookup
      if ("type" in entry && entry.type === "table") {
        if (databaseId != null) {
          return Urls.dataStudioErdSchema(
            databaseId,
            schema ?? "",
            [entry.id as ConcreteTableId],
          );
        }
        return `${Urls.dataStudioErdBase()}?table-ids=${entry.id}`;
      }

      return Urls.dataStudioErdBase();
    },
    [databaseId, schema],
  );

  return (
    <SchemaViewerContext.Provider value={schemaViewerContextValue}>
      <ReactFlow
        className={S.reactFlow}
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        proOptions={PRO_OPTIONS}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        colorMode={colorScheme === "dark" ? "dark" : "light"}
        fitView
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
      >
        <Background />
        <Controls showInteractive={false} />
        <Panel position="top-right">
          <Group gap="sm">
            {shareUrl != null && (
              <Tooltip
                label={
                  <Text fw={700} c="inherit">
                    {clipboard.copied ? t`Copied!` : t`Share this schema`}
                  </Text>
                }
                opened={clipboard.copied ? true : undefined}
              >
                <ActionIcon
                  variant="default"
                  onClick={handleShare}
                  aria-label={t`Copy link`}
                >
                  <Icon name="link" />
                </ActionIcon>
              </Tooltip>
            )}
            <AppSwitcher className={S.appSwitcher} />
          </Group>
        </Panel>
        {nodes.length > 0 && <SchemaViewerNodeLayout />}
        <Panel className={S.entryInput} position="top-left">
          <GraphEntryInput
            node={entryNode}
            isGraphFetching={isFetching}
            getGraphUrl={getGraphUrl}
            allowedSearchModels={TABLE_SEARCH_MODELS}
            pickerModels={TABLE_PICKER_MODELS}
          />
        </Panel>
        {isFetching && (
          <Box className={S.centerLoader}>
            <Loader />
          </Box>
        )}
        {error != null && (
          <Panel position="bottom-center">
            <Stack align="center" justify="center" mb="xl">
              <Text c="text-secondary">
                {getErrorMessage(error, t`Failed to load schema.`)}
              </Text>
            </Stack>
          </Panel>
        )}
        {!hasEntry && !isFetching && error == null && (
          <Panel position="top-center">
            <Stack align="center" justify="center" pt="xl">
              <Text c="text-tertiary">{t`Pick a table to view its schema`}</Text>
            </Stack>
          </Panel>
        )}
      </ReactFlow>
    </SchemaViewerContext.Provider>
  );
}
