import {
  type App,
  type McpUiHostContext,
  applyDocumentTheme,
  applyHostFonts,
  applyHostStyleVariables,
  useApp,
} from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useMemo, useState } from "react";

interface McpAppState {
  query: string | null;
  hostContext: McpUiHostContext | null;
  app: App | null;
}

type ToolArgument = { query?: string } | undefined;

function applyHostContext(ctx: McpUiHostContext) {
  if (ctx.theme) {
    applyDocumentTheme(ctx.theme);
  }

  if (ctx.styles?.variables) {
    applyHostStyleVariables(ctx.styles.variables);
  }

  if (ctx.styles?.css?.fonts) {
    applyHostFonts(ctx.styles.css.fonts);
  }
}

function useDevMcpApp(): McpAppState | null {
  return useMemo(() => {
    if (process.env.NODE_ENV !== "development") {
      return null;
    }

    const params = new URLSearchParams(window.location.search);
    const query = params.get("query");

    if (!query) {
      return null;
    }

    return {
      query,
      hostContext: { theme: "light" },
      app: null,
    };
  }, []);
}

export function useMcpApp(): McpAppState {
  const devState = useDevMcpApp();

  const [query, setQuery] = useState<string | null>(null);
  const [hostContext, setHostContext] = useState<McpUiHostContext | null>(null);

  const { app } = useApp({
    appInfo: { name: "metabase-visualize-query", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (app) => {
      app.onhostcontextchanged = (context) => {
        if (context) {
          applyHostContext(context);
          setHostContext((prev) => ({ ...prev, ...context }));
        }
      };

      app.ontoolinput = (params) => {
        const { query } = (params.arguments as ToolArgument) ?? {};

        if (query) {
          setQuery(query);
        }
      };

      // Fallback: ontoolinput may be missed if the tool returns instantly
      // (notification sent before the app finishes connecting).
      app.ontoolresult = (params) => {
        const { query } = (params.structuredContent as ToolArgument) ?? {};

        if (query) {
          setQuery(query);
        }
      };
    },
  });

  // Read host context once connected and apply styles immediately
  useEffect(() => {
    if (app) {
      const context = app.getHostContext();

      if (context) {
        applyHostContext(context);
        setHostContext(context);
      }
    }
  }, [app]);

  return devState ?? { query, hostContext, app };
}
