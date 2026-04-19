import { useState } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { DatePicker } from "metabase/querying/common/components/DatePicker";
import type { DatePickerValue } from "metabase/querying/common/types";
import { getDateFilterDisplayName } from "metabase/querying/common/utils/dates";
import {
  getDateFilterClause,
  getDatePickerUnits,
  getDatePickerValue,
} from "metabase/querying/filters/utils/dates";
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
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);

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

  // Strip the temporal bucket from the column — date filters operate on the
  // raw date column, not the bucketed version used in the breakout.
  const rawTemporalColumn = temporalColumn
    ? Lib.withTemporalBucket(temporalColumn, null)
    : null;

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

  // --- Date range filter ---
  // Find the first date filter in the current query (the one we manage).
  const allFilters = Lib.filters(query, stageIndex);
  let dateFilterClause: Lib.FilterClause | null = null;
  let dateFilterValue: DatePickerValue | undefined = undefined;

  for (const f of allFilters) {
    const value = getDatePickerValue(query, stageIndex, f);
    if (value != null) {
      dateFilterClause = f;
      dateFilterValue = value;
      break;
    }
  }

  const dateFilterLabel = dateFilterValue
    ? getDateFilterDisplayName(dateFilterValue)
    : t`All time`;

  const datePickerUnits = rawTemporalColumn
    ? getDatePickerUnits(query, stageIndex, rawTemporalColumn)
    : [];

  const handleDateFilterChange = (value: DatePickerValue) => {
    if (!rawTemporalColumn) {
      return;
    }
    const newFilterClause = getDateFilterClause(rawTemporalColumn, value);
    const newQuery = dateFilterClause
      ? Lib.replaceClause(query, stageIndex, dateFilterClause, newFilterClause)
      : Lib.filter(query, stageIndex, newFilterClause);
    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsDateFilterOpen(false);
  };

  const handleDateFilterClear = () => {
    if (!dateFilterClause) {
      return;
    }
    const newQuery = Lib.removeClause(query, stageIndex, dateFilterClause);
    updateQuestion(question.setQuery(newQuery), { run: true });
    setIsDateFilterOpen(false);
  };

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

      {/* Date range filter — only shown when the query has a temporal breakout */}
      {rawTemporalColumn && (
        <>
          <Divider
            orientation="vertical"
            mx="xs"
            style={{ borderColor: "var(--mb-color-border)" }}
          />
          <Popover opened={isDateFilterOpen} onChange={setIsDateFilterOpen}>
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
                onClick={() => setIsDateFilterOpen(!isDateFilterOpen)}
              >
                {dateFilterLabel}
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <DatePicker
                value={dateFilterValue}
                availableUnits={datePickerUnits}
                onChange={handleDateFilterChange}
                renderSubmitButton={({ value }) => (
                  <Flex justify="space-between" w="100%">
                    {dateFilterClause ? (
                      <Button
                        variant="subtle"
                        c="text-secondary"
                        onClick={handleDateFilterClear}
                      >
                        {t`All time`}
                      </Button>
                    ) : (
                      <div />
                    )}
                    <Button
                      type="submit"
                      variant="filled"
                      disabled={!value}
                    >{t`Apply`}</Button>
                  </Flex>
                )}
              />
            </Popover.Dropdown>
          </Popover>
        </>
      )}

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
                w={120}
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
