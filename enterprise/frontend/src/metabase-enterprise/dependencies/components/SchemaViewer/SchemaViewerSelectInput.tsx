import { useDisclosure } from "@mantine/hooks";
import { useReactFlow } from "@xyflow/react";
import { useMemo, useState } from "react";
import { t } from "ttag";

import { Button, Card, FixedSizeIcon, Select, Tooltip } from "metabase/ui";

import type { SchemaViewerFlowNode } from "./types";

type SchemaViewerSelectInputProps = {
  nodes: SchemaViewerFlowNode[];
};

export function SchemaViewerSelectInput({
  nodes,
}: SchemaViewerSelectInputProps) {
  const { fitView } = useReactFlow();
  const data = useMemo(() => getSelectItems(nodes), [nodes]);
  const [isOpened, { open, close }] = useDisclosure(false);
  const [selectedValue, setSelectedValue] = useState<string | null>(null);

  const handleChange = (value: string | null) => {
    setSelectedValue(value);
    if (value == null) {
      fitView({ nodes, duration: 300 });
      return;
    }
    const selectedNode = nodes.find((node) => node.id === value);
    if (selectedNode != null) {
      fitView({ nodes: [selectedNode], duration: 300, padding: 0.5 });
    }
  };

  return (
    <Card p={0} flex="0 0 auto" bdrs={0} bg="transparent">
      {isOpened ? (
        <Select
          value={selectedValue}
          data={data}
          placeholder={t`Jump to a table on the graph`}
          nothingFoundMessage={t`Didn't find any results`}
          leftSection={<FixedSizeIcon name="search" />}
          w="20rem"
          searchable
          clearable
          autoFocus
          data-testid="schema-viewer-selection-input"
          onChange={handleChange}
          onBlur={close}
        />
      ) : (
        <Tooltip label={t`Jump to a table on the graph`}>
          <Button
            leftSection={<FixedSizeIcon name="search" />}
            data-testid="schema-viewer-selection-button"
            onClick={open}
          />
        </Tooltip>
      )}
    </Card>
  );
}

function getSelectItems(nodes: SchemaViewerFlowNode[]) {
  return nodes.map((node) => ({
    value: node.id,
    label: node.data.display_name ?? node.data.name,
  }));
}
