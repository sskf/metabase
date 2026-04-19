import { type CSSProperties, useEffect, useMemo, useState } from "react";

import { ComponentProvider } from "embedding-sdk-bundle/components/public/ComponentProvider";
import { SdkQuestion } from "embedding-sdk-bundle/components/public/SdkQuestion";
import { getSdkStore } from "embedding-sdk-bundle/store";
import { refreshSiteSettings } from "metabase/redux/settings";
import { refreshCurrentUser } from "metabase/redux/user";
import { Flex } from "metabase/ui";
import type { ResolvedColorScheme } from "metabase/utils/color-scheme";
import { b64_to_utf8, utf8_to_b64 } from "metabase/utils/encoding";
import type { Card } from "metabase-types/api";

import { McpQueryBar } from "./McpQueryBar";
import { useMcpApp } from "./hooks/useMcpApp";
import { buildMcpAppsTheme } from "./utils/buildMcpAppsTheme";

// Drills that refine the current visualization without changing what it IS.
// The chart's conceptual "title" stays the same — zoom, granularity, ordering.
// Prefix-matched: e.g. "sort" matches both "sort.ascending" and "sort.descending".
const STAY_DRILL_PREFIXES = [
  "zoom",
  "zoom-in.binning",
  "zoom-in.timeseries",
  "zoom-in.geographic",
  "sort",
];

const isStayDrill = (drillName: string | undefined) =>
  drillName != null &&
  STAY_DRILL_PREFIXES.some(
    (prefix) => drillName === prefix || drillName.startsWith(`${prefix}.`),
  );

// Human-readable labels for GO drills — drills that produce a conceptually
// different chart (one with a different title). Prefix-matched.
const DRILL_LABELS: Record<string, string> = {
  "underlying-records": "Show the underlying records",
  pk: "Show details for this row",
  "fk-details": "Show details for this row",
  "fk-filter": "Filter by this value",
  "quick-filter": "Filter by this value",
  "column-filter": "Filter by this column",
  "breakout-by": "Break this down further",
  pivot: "Break this down further",
  distribution: "Show the distribution",
  "summarize-column-by-time": "Summarize this column over time",
  "summarize-column": "Summarize this column",
  extract: "Extract this column",
  combine: "Combine these columns",
  "automatic-insights": "Show automatic insights",
};

const getDrillLabel = (drillName: string | undefined): string => {
  if (!drillName) {
    return "Show more details";
  }
  // Exact match first, then prefix match (e.g. "quick-filter.=" → "quick-filter")
  if (DRILL_LABELS[drillName]) {
    return DRILL_LABELS[drillName];
  }
  const prefix = Object.keys(DRILL_LABELS).find((key) =>
    drillName.startsWith(`${key}.`),
  );
  return prefix ? DRILL_LABELS[prefix] : "Show more details";
};

const store = getSdkStore();

// CSS for .mcp-loading and .mcp-spinner is defined globally in embed-mcp.html.
const SimpleLoader = () => (
  <div className="mcp-loading">
    <span className="mcp-spinner" />
  </div>
);

export function McpUiAppRoute() {
  const { query, hostContext, app } = useMcpApp();

  const [isSettingsReady, setIsSettingsReady] = useState(false);

  const { instanceUrl } = window.metabaseConfig ?? { instanceUrl: "" };

  const scheme: ResolvedColorScheme =
    hostContext?.theme === "dark" ? "dark" : "light";

  const hostCssVariables: Record<string, string> = useMemo(
    () => hostContext?.styles?.variables ?? {},
    [hostContext?.styles?.variables],
  );

  const safeAreaInsets = hostContext?.safeAreaInsets ?? {
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  };

  const deserializedCard = useMemo(() => {
    if (!query) {
      return null;
    }

    try {
      return {
        display: "table",
        dataset_query: JSON.parse(b64_to_utf8(query)),
        visualization_settings: {},
      } as Card;
    } catch {
      return null;
    }
  }, [query]);

  const theme = useMemo(
    () => buildMcpAppsTheme(hostCssVariables, scheme),
    [hostCssVariables, scheme],
  );

  // The OSS no-op initAuth never loads user or settings. Do it ourselves so
  // selectors like getTokenFeature has populated settings.
  // We also no-op the EE auth flow (auth.ts) when in MCP Apps route.
  useEffect(() => {
    Promise.all([
      store.dispatch(refreshCurrentUser()),
      store.dispatch(refreshSiteSettings()),
    ]).then(() => setIsSettingsReady(true));
  }, []);

  const isReady = !!(
    instanceUrl &&
    hostContext &&
    isSettingsReady &&
    deserializedCard
  );

  useEffect(() => {
    // Remove the loading indicator on the HTML page once the app is ready
    if (isReady) {
      document.getElementById("mcp-loading")?.remove();
    }
  }, [isReady]);

  const containerStyle: CSSProperties = {
    boxSizing: "border-box",
    backgroundColor: theme.colors?.background,
    height: "500px",
    display: "flex",
    flexDirection: "column",

    // Apply safe area insets from the host environment.
    padding: `${Math.max(safeAreaInsets.top, 0)}px ${Math.max(safeAreaInsets.right, 0)}px ${Math.max(safeAreaInsets.bottom, 0)}px ${Math.max(safeAreaInsets.left, 0)}px`,
  };

  if (!isReady) {
    return null;
  }

  const onDrillThrough: NonNullable<
    React.ComponentProps<typeof SdkQuestion>["onDrillThrough"]
  > = async ({ drillName, nextCard, description }, defaultNavigate) => {
    // eslint-disable-next-line no-console
    console.log("[MCP] onDrillThrough", { drillName, app: !!app });

    if (isStayDrill(drillName)) {
      // eslint-disable-next-line no-console
      console.log("[MCP] STAY drill — navigating in place");

      await defaultNavigate();
    } else if (app) {
      try {
        const label = getDrillLabel(drillName);

        const encodedQuery = utf8_to_b64(
          JSON.stringify(nextCard.dataset_query),
        );

        // Inject the encoded query as model context so the LLM can
        // call visualize_query directly without it appearing in chat.
        try {
          await app.updateModelContext({
            content: [
              {
                type: "text",
                text: `Drill-through encoded query (use this with visualize_query if available): ${encodedQuery}`,
              },
            ],
          });
          // eslint-disable-next-line no-console
          console.log("[MCP] updateModelContext injected encoded query");
        } catch (e) {
          console.error("[MCP] updateModelContext error", e);
        }

        // Use assertive phrasing so the LLM reliably acts on the injected
        // context. "If you have" was conditional enough that the LLM often
        // skipped the lookup entirely.
        await app.sendMessage({
          role: "user",
          content: [
            {
              type: "text",
              text: `${label}: ${description}. The encoded query has been added to your context — retrieve it and call visualize_query with it.`,
            },
          ],
        });
      } catch (e) {
        console.error("[MCP] sendMessage error", e);
      }
    } else {
      // eslint-disable-next-line no-console
      console.log("[MCP] GO drill — no app instance (dev mode)");
    }
  };

  return (
    <ComponentProvider
      authConfig={{ metabaseInstanceUrl: instanceUrl }}
      theme={theme}
      reduxStore={store}
      loaderComponent={SimpleLoader}
    >
      <div style={containerStyle}>
        <SdkQuestion
          deserializedCard={deserializedCard}
          isSaveEnabled={false}
          // we should never show query builder in chat interfaces
          withEditorButton={false}
          withChartTypeSelector={false}
          onDrillThrough={onDrillThrough}
        >
          {/* Visualization fills the remaining space */}
          <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
            <SdkQuestion.QuestionVisualization height="calc(500px - 4rem)" />
          </div>
          {/* Metric-viewer-style query bar: chart type + time granularity */}
          <Flex justify="center" py="xs" style={{ flexShrink: 0 }}>
            <McpQueryBar />
          </Flex>
        </SdkQuestion>
      </div>
    </ComponentProvider>
  );
}
