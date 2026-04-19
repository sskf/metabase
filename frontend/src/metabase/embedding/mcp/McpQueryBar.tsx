import { useState } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import {
  ActionIcon,
  Box,
  Button,
  DefaultSelectItem,
  Divider,
  Flex,
  Icon,
  Popover,
} from "metabase/ui";
import * as Lib from "metabase-lib";
import type { TemporalUnit } from "metabase-types/api";

const CHART_TYPES = [
  { type: "line" as const, icon: "line" as const },
  { type: "bar" as const, icon: "bar" as const },
  { type: "area" as const, icon: "area" as const },
];

type McpChartType = "line" | "bar" | "area";

function isMcpChartType(type: string): type is McpChartType {
  return CHART_TYPES.some((c) => c.type === type);
}

export function McpQueryBar() {
  const { question, updateQuestion } = useSdkQuestionContext();
  const [isBucketOpen, setIsBucketOpen] = useState(false);

  if (!question) {
    return null;
  }

  const query = question.query();
  const stageIndex = -1;

  // --- Chart type ---
  const rawDisplay = question.display();
  const selectedChartType: McpChartType = isMcpChartType(rawDisplay)
    ? rawDisplay
    : "line";

  const handleDisplayChange = (type: McpChartType) => {
    updateQuestion(question.setDisplay(type).lockDisplay(), { run: false });
  };

  // --- Temporal breakout ---
  const breakoutClauses = Lib.breakouts(query, stageIndex);
  let temporalClause: Lib.BreakoutClause | null = null;
  let temporalColumn: Lib.ColumnMetadata | null = null;

  for (const clause of breakoutClauses) {
    const col = Lib.breakoutColumn(query, stageIndex, clause);
    if (col && Lib.isTemporalBucketable(query, stageIndex, col)) {
      temporalClause = clause;
      temporalColumn = col;
      break;
    }
  }

  const currentBucket = temporalColumn
    ? Lib.temporalBucket(temporalColumn)
    : null;
  const currentUnit = currentBucket
    ? (Lib.displayInfo(query, stageIndex, currentBucket)
        .shortName as TemporalUnit)
    : undefined;

  const availableBuckets = temporalColumn
    ? Lib.availableTemporalBuckets(query, stageIndex, temporalColumn)
    : [];

  const availableItems = availableBuckets.map((bucket) => {
    const info = Lib.displayInfo(query, stageIndex, bucket);
    const unit = info.shortName as TemporalUnit;
    return { bucket, unit, label: Lib.describeTemporalUnit(unit) };
  });

  const handleBucketChange = (bucket: Lib.Bucket | null) => {
    if (!temporalClause || !temporalColumn) {
      return;
    }
    const newColumn = Lib.withTemporalBucket(temporalColumn, bucket);
    const newQuery = Lib.replaceClause(
      query,
      stageIndex,
      temporalClause,
      newColumn,
    );
    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsBucketOpen(false);
  };

  const bucketLabel = currentUnit
    ? t`by ${Lib.describeTemporalUnit(currentUnit).toLowerCase()}`
    : t`All time`;

  return (
    <Flex
      maw="100%"
      h="3rem"
      display="inline-flex"
      bg="background-primary"
      bd="1px solid var(--mb-color-border)"
      bdrs="lg"
      px="sm"
      align="center"
      gap="xs"
    >
      {/* Chart type buttons */}
      <Flex gap="xs" bg="background-secondary" p="xs" bdrs="md">
        {CHART_TYPES.map(({ type, icon }) => (
          <ActionIcon
            key={type}
            w="2rem"
            variant={selectedChartType === type ? "filled" : "subtle"}
            bg={selectedChartType === type ? "background-primary" : undefined}
            onClick={() => handleDisplayChange(type)}
            aria-label={type}
          >
            <Icon
              name={icon}
              c={selectedChartType === type ? "brand" : "text-primary"}
            />
          </ActionIcon>
        ))}
      </Flex>

      {/* Temporal bucket picker — only shown when the query has a temporal breakout */}
      {temporalColumn && availableItems.length > 0 && (
        <>
          <Divider
            orientation="vertical"
            mx="xs"
            style={{ borderColor: "var(--mb-color-border)" }}
          />
          <Popover opened={isBucketOpen} onChange={setIsBucketOpen}>
            <Popover.Target>
              <Button
                w={160}
                justify="space-between"
                fw="bold"
                py="xs"
                px="sm"
                variant="subtle"
                color="text-primary"
                rightSection={<Icon name="chevrondown" size={12} />}
                onClick={() => setIsBucketOpen(!isBucketOpen)}
              >
                {bucketLabel}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Box p="sm" miw={180}>
                <DefaultSelectItem
                  value="none"
                  label={t`All time`}
                  selected={!currentUnit}
                  onClick={() => handleBucketChange(null)}
                  role="option"
                />
                {availableItems.map(({ bucket, unit, label }) => (
                  <DefaultSelectItem
                    key={unit}
                    value={unit}
                    label={label}
                    selected={currentUnit === unit}
                    onClick={() => handleBucketChange(bucket)}
                    role="option"
                  />
                ))}
              </Box>
            </Popover.Dropdown>
          </Popover>
        </>
      )}
    </Flex>
  );
}
