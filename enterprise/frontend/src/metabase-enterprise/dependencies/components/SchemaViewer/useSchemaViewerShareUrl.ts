import { useMemo } from "react";

import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

interface SchemaViewerShareState {
  databaseId: DatabaseId;
  schema: string | undefined;
  tableIds: ConcreteTableId[];
}

export function encode(state: SchemaViewerShareState): string {
  const payload = {
    d: state.databaseId,
    s: state.schema ?? "",
    t: state.tableIds,
  };
  return btoa(JSON.stringify(payload));
}

export function decodeSchemaViewerShareState(
  encoded: string,
): SchemaViewerShareState | null {
  try {
    const json = JSON.parse(atob(encoded));
    if (typeof json.d !== "number" || !Array.isArray(json.t)) {
      return null;
    }
    return {
      databaseId: json.d,
      schema: json.s || undefined,
      tableIds: json.t as ConcreteTableId[],
    };
  } catch {
    return null;
  }
}

export function useSchemaViewerShareUrl({
  databaseId,
  schema,
  tableIds,
}: {
  databaseId: DatabaseId | undefined;
  schema: string | undefined;
  tableIds: ConcreteTableId[] | null;
}): string | null {
  return useMemo(() => {
    if (databaseId == null || tableIds == null || tableIds.length === 0) {
      return null;
    }
    const encoded = encode({ databaseId, schema, tableIds });
    return `${window.location.origin}${window.location.pathname}?share=${encoded}`;
  }, [databaseId, schema, tableIds]);
}
