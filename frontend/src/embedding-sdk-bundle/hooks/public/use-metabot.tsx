import { useCallback, useMemo, useRef } from "react";
import { match } from "ts-pattern";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { InteractiveQuestionInternal } from "embedding-sdk-bundle/components/public/InteractiveQuestion";
import { StaticQuestionInternal } from "embedding-sdk-bundle/components/public/StaticQuestion";
import type { SdkStore } from "embedding-sdk-bundle/store/types";
import type { MetabaseAuthConfig } from "embedding-sdk-bundle/types";
import type {
  MetabotChartProps,
  MetabotMessage,
  UseMetabotResult,
} from "embedding-sdk-bundle/types/metabot";
import { useMetabaseProviderPropsStore } from "embedding-sdk-shared/hooks/use-metabase-provider-props-store";
import { useMetabotAgent } from "metabase/metabot/hooks";
import { useMetabotReactions } from "metabase/metabot/hooks/use-metabot-reactions";
import type { MetabotChatMessage } from "metabase/metabot/state/types";

type ChartComponentContext = {
  authConfig: MetabaseAuthConfig;
  reduxStore: SdkStore;
};

/**
 * Public-facing hook for interacting with Metabot in the SDK.
 *
 * Provides a stable, SDK-friendly API for sending messages, managing
 * conversation state, and reading Metabot responses.
 */
export const useMetabot = (): UseMetabotResult => {
  const agent = useMetabotAgent();
  const { navigateToPath } = useMetabotReactions();
  const chartComponentsCache = useRef(
    new Map<string, ReturnType<typeof createChartComponent>>(),
  );

  const {
    state: {
      props: metabaseProviderProps,
      internalProps: { reduxStore },
    },
  } = useMetabaseProviderPropsStore();

  const chartContext = useMemo<ChartComponentContext | null>(() => {
    if (!metabaseProviderProps?.authConfig || !reduxStore) {
      return null;
    }
    return {
      authConfig: metabaseProviderProps.authConfig,
      reduxStore,
    };
  }, [metabaseProviderProps?.authConfig, reduxStore]);

  const CurrentChart = useMemo(
    () =>
      navigateToPath && chartContext
        ? getCachedChartComponent(
            navigateToPath,
            chartComponentsCache.current,
            chartContext,
          )
        : null,
    [navigateToPath, chartContext],
  );

  const agentSubmitMessage = agent.submitInput;
  const submitMessage = useCallback(
    (message: string): Promise<void> => {
      return agentSubmitMessage(message, { preventOpenSidebar: true }).then(
        () => undefined,
      );
    },
    [agentSubmitMessage],
  );

  const agentRetryMessage = agent.retryMessage;
  const retryMessage = useCallback(
    (messageId: string): Promise<void> => {
      return agentRetryMessage(messageId);
    },
    [agentRetryMessage],
  );

  const messages = useMemo<MetabotMessage[]>(
    () =>
      agent.messages
        .filter(isPublicMessage)
        .map((message) =>
          mapMessage(message, chartComponentsCache.current, chartContext),
        ),
    [agent.messages, chartContext],
  );

  return {
    submitMessage,
    retryMessage,
    cancelRequest: agent.cancelRequest,
    resetConversation: agent.resetConversation,

    messages,
    errorMessages: agent.errorMessages,
    isProcessing: agent.isDoingScience,

    CurrentChart,
  };
};

/**
 * Creates a chart component bound to a `navigateTo` path.
 * `drills={false}` (default) renders a StaticQuestion;
 * `drills={true}` renders an InteractiveQuestion.
 *
 * The returned component wraps its content in a `ComponentProvider` so that
 * callers of `useMetabot()` can render charts under a bare `MetabaseProvider`
 * (without a surrounding `ComponentProvider`/`MetabotQuestion`). Nested
 * `ComponentProvider` instances are idempotent: `isDataUninitialized()`
 * short-circuits the init dispatch, and `EnsureSingleInstance` dedupes
 * CSS/fonts/portal rendering.
 */
function createChartComponent(
  questionPath: string,
  context: ChartComponentContext,
) {
  return function MetabotChart({ drills, ...rest }: MetabotChartProps) {
    return (
      <ComponentProvider
        authConfig={context.authConfig}
        reduxStore={context.reduxStore}
      >
        {drills ? (
          <InteractiveQuestionInternal query={questionPath} {...rest} />
        ) : (
          <StaticQuestionInternal query={questionPath} {...rest} />
        )}
      </ComponentProvider>
    );
  };
}

function getCachedChartComponent(
  questionPath: string,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
  context: ChartComponentContext,
) {
  // Cache key is `questionPath` only by design. The cache lives in a
  // `useRef` on `useMetabot`, so it is torn down with the hook call; store
  // identity can only change via a subscriber remount, which resets the
  // cache naturally.
  if (!cache.has(questionPath)) {
    cache.set(questionPath, createChartComponent(questionPath, context));
  }
  return cache.get(questionPath)!;
}

// These internal variants are intentionally not surfaced in the public SDK —
// see the comment on `MetabotMessage` in `embedding-sdk-bundle/types/metabot.ts`
// for the full rationale.
type PublicChatMessage = Exclude<
  MetabotChatMessage,
  { type: "tool_call" | "edit_suggestion" | "action" | "todo_list" }
>;

const isPublicMessage = (
  message: MetabotChatMessage,
): message is PublicChatMessage =>
  message.type !== "tool_call" &&
  message.type !== "edit_suggestion" &&
  message.type !== "action" &&
  message.type !== "todo_list";

const mapMessage = (
  message: PublicChatMessage,
  cache: Map<string, ReturnType<typeof createChartComponent>>,
  context: ChartComponentContext | null,
): MetabotMessage =>
  match(message)
    .with(
      { role: "user", type: "text" },
      ({ id, message }) =>
        ({ id, role: "user", type: "text", message }) as const,
    )
    .with(
      { role: "agent", type: "text" },
      ({ id, message }) =>
        ({ id, role: "agent", type: "text", message }) as const,
    )
    .with({ role: "agent", type: "chart" }, ({ id, navigateTo }) => {
      const Component = context
        ? getCachedChartComponent(navigateTo, cache, context)
        : FallbackChartComponent;
      return {
        id,
        role: "agent",
        type: "chart",
        questionPath: navigateTo,
        Component,
      } as const;
    })
    .exhaustive();

// Rendered only when `useMetabot` is called outside a `MetabaseProvider`
// with authConfig + reduxStore populated. In normal usage this branch is
// unreachable; keeping a placeholder preserves the message shape.
const FallbackChartComponent = () => null;
