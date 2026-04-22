import { useMemo } from "react";

import { useSdkQuestionContext } from "embedding-sdk-bundle/components/private/SdkQuestion/context";
import { getAdHocQuestionDescription } from "metabase/query_builder/components/view/ViewHeader/components/AdHocQuestionDescription/AdHocQuestionDescription";
import { Text } from "metabase/ui";
import * as Lib from "metabase-lib";

/**
 * Renders a minimal question title without temporal bucket suffixes.
 * e.g. "Sum of Total by Created At" instead of "Sum of Total by Created At: Month".
 * Returns null when the query has no aggregations or breakouts.
 */
export function McpQuestionTitle() {
  const { question } = useSdkQuestionContext();

  // Strip temporal buckets from all breakouts so the title reads
  // "Sum of Total by Created At" instead of "Sum of Total by Created At: Month".
  const title = useMemo(() => {
    if (!question) {
      return "";
    }
    const query = question.query();
    const stageIndex = -1;
    const strippedQuery = Lib.breakouts(query, stageIndex).reduce(
      (q, breakout) => {
        const col = Lib.breakoutColumn(q, stageIndex, breakout);
        if (!col || !Lib.isTemporalBucketable(q, stageIndex, col)) {
          return q;
        }

        return Lib.replaceClause(
          q,
          stageIndex,
          breakout,
          Lib.withTemporalBucket(col, null),
        );
      },
      query,
    );

    const strippedQuestion = question.setQuery(strippedQuery);

    return (
      getAdHocQuestionDescription({ question: strippedQuestion }) ||
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
