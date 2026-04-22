import { useMemo } from "react";
import { t } from "ttag";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";

/**
 * Renders a minimal question title without temporal bucket suffixes.
 * e.g. "Sum of Total by Created At" instead of "Sum of Total by Created At: Month".
 *
 * Drill-through queries are typically multi-stage (source query with agg/breakout
 * wrapped in an outer filter stage). We scan from the innermost stage outward to
 * find the first stage with aggregations or breakouts, so drill titles work too.
 *
 * Returns null when no meaningful title can be derived.
 */
export function McpQuestionTitle() {
  const { question } = useSdkQuestionContext();

  const title = useMemo(() => {
    if (!question) {
      return "";
    }

    const query = question.query();
    const stageCount = Lib.stageCount(query);

    // Scan from innermost stage outward for the first stage with agg or breakouts.
    // Drill-through queries wrap the source (agg+breakout) in an outer filter stage,
    // so stage -1 often has zero agg/breakouts — we need to look deeper.
    let stageIndex: number | null = null;
    for (let i = -stageCount; i <= -1; i++) {
      if (
        Lib.aggregations(query, i).length > 0 ||
        Lib.breakouts(query, i).length > 0
      ) {
        stageIndex = i;
        break;
      }
    }

    if (stageIndex === null) {
      return question.displayName() || "";
    }

    const aggregations = Lib.aggregations(query, stageIndex);
    const breakouts = Lib.breakouts(query, stageIndex);

    const aggregationNames = aggregations
      .map((a) => Lib.displayInfo(query, stageIndex!, a).longDisplayName)
      .join(t` and `);

    const breakoutNames = breakouts
      .map((b) => {
        const col = Lib.breakoutColumn(query, stageIndex!, b);
        // Strip temporal bucket: "Created At: Month" → "Created At"
        const unbucketed =
          col && Lib.isTemporalBucketable(query, stageIndex!, col)
            ? Lib.withTemporalBucket(col, null)
            : col;
        return unbucketed
          ? Lib.displayInfo(query, stageIndex!, unbucketed).displayName
          : Lib.displayInfo(query, stageIndex!, b).longDisplayName;
      })
      .join(t` and `);

    return (
      [aggregationNames, breakoutNames].filter(Boolean).join(t` by `) ||
      question.displayName() ||
      ""
    );
  }, [question]);

  if (!title) {
    return null;
  }

  return (
    <Text fw={700} fz="sm" px="md" pt="sm" truncate>
      {title}
    </Text>
  );
}
