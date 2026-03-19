import { type NodeProps, useReactFlow } from "@xyflow/react";
import cx from "classnames";
import { memo, useCallback, useMemo } from "react";
import { t } from "ttag";

import { ActionIcon, Box, Group, Icon, Stack, Tooltip } from "metabase/ui";
import { getAccentColors } from "metabase/ui/colors/groups";
import { isTypePK } from "metabase-lib/v1/types/utils/isa";

import { TOOLTIP_OPEN_DELAY_MS } from "../../../constants";
import type { SchemaViewerFlowNode } from "../types";

import { SchemaViewerFieldRow } from "./SchemaViewerFieldRow";
import S from "./SchemaViewerTableNode.module.css";

const ICON_COLORS = getAccentColors({ light: false, dark: false, gray: false });

type SchemaViewerTableNodeProps = NodeProps<SchemaViewerFlowNode>;

// Track which node is currently focused for double-click toggle
let focusedNodeId: string | null = null;

export const SchemaViewerTableNode = memo(function SchemaViewerTableNode({
  id,
  data,
}: SchemaViewerTableNodeProps) {
  const { fitView, getNodes } = useReactFlow<SchemaViewerFlowNode>();
  const headerColor = data.is_focal ? "brand" : "text-primary";
  const iconColor = ICON_COLORS[Number(data.table_id) % ICON_COLORS.length];

  const handleDoubleClick = useCallback(() => {
    if (focusedNodeId === id) {
      // Already focused — zoom out to fit all
      fitView({ duration: 300 });
      focusedNodeId = null;
    } else {
      // Focus on this node
      const nodes = getNodes();
      const node = nodes.find((n) => n.id === id);
      if (node) {
        fitView({
          nodes: [node],
          duration: 300,
          padding: 0.5,
        });
      }
      focusedNodeId = id;
    }
  }, [fitView, id, getNodes]);

  const selfRefTargetIds = useMemo(() => {
    const pkIds = new Set(
      data.fields.filter((f) => isTypePK(f.semantic_type)).map((f) => f.id),
    );
    const targetIds = new Set<number>();
    for (const field of data.fields) {
      if (
        field.fk_target_field_id != null &&
        pkIds.has(field.fk_target_field_id)
      ) {
        targetIds.add(field.fk_target_field_id);
      }
    }
    return targetIds;
  }, [data.fields]);

  const tableDetailsUrl = `/data-studio/data/database/${data.db_id}/schema/${data.db_id}:${data.schema ?? ""}/table/${data.table_id}`;

  return (
    <Stack
      className={cx(S.card, { [S.focal]: data.is_focal })}
      gap={0}
      onDoubleClick={handleDoubleClick}
    >
      <Group className={S.header} gap={8} px={16} py={20} wrap="nowrap">
        <Icon name="table2" style={{ color: iconColor }} />
        <Box
          fz={17}
          c={headerColor}
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            flex: 1,
          }}
        >
          {data.name}
        </Box>
        <Tooltip
          label={t`View table details`}
          openDelay={TOOLTIP_OPEN_DELAY_MS}
        >
          <ActionIcon
            component="a"
            href={tableDetailsUrl}
            target="_blank"
            className={S.detailsLink}
            variant="subtle"
            c="text-tertiary"
            size="sm"
            onClick={(e) => e.stopPropagation()}
          >
            <Icon name="external" size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <Box className={S.fields}>
        {data.fields.map((field) => (
          <SchemaViewerFieldRow
            key={field.id}
            field={field}
            isConnected={data.connectedFieldIds.has(field.id)}
            hasSelfRefTarget={selfRefTargetIds.has(field.id)}
          />
        ))}
      </Box>
    </Stack>
  );
});
