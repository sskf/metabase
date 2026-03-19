import type { Location } from "history";
import { useEffect, useMemo, useRef } from "react";
import { push } from "react-router-redux";
import { t } from "ttag";

import {
  skipToken,
  useGetTableQuery,
  useListDatabasesQuery,
} from "metabase/api";
import { useUserKeyValue } from "metabase/common/hooks/use-user-key-value";
import { usePageTitle } from "metabase/hooks/use-page-title";
import { useDispatch } from "metabase/lib/redux";
import * as Urls from "metabase/lib/urls";
import { Stack } from "metabase/ui";
import type { ConcreteTableId, DatabaseId } from "metabase-types/api";

import { SchemaViewer } from "../../components/SchemaViewer";
import { decodeSchemaViewerShareState } from "../../components/SchemaViewer/useSchemaViewerShareUrl";

type SchemaViewerPageQuery = {
  "database-id"?: string;
  "table-ids"?: string | string[];
  schema?: string;
  share?: string;
};

type SchemaViewerPageProps = {
  location?: Location<SchemaViewerPageQuery>;
};

export function SchemaViewerPage({ location }: SchemaViewerPageProps) {
  usePageTitle(t`Schema viewer`);
  const dispatch = useDispatch();

  const rawShare = location?.query?.share;
  const sharedState = useMemo(
    () =>
      rawShare != null ? decodeSchemaViewerShareState(rawShare) : undefined,
    [rawShare],
  );

  const rawDatabaseId = location?.query?.["database-id"];
  const rawTableIds = location?.query?.["table-ids"];
  const schema = location?.query?.schema;

  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;

  const initialTableIds = useMemo(() => {
    if (rawTableIds == null) {
      return undefined;
    }
    const ids = Array.isArray(rawTableIds) ? rawTableIds : [rawTableIds];
    return ids.map((id) => Number(id) as ConcreteTableId);
  }, [rawTableIds]);

  // When table-ids is present without database-id, resolve the database from table metadata
  const needsTableLookup =
    rawTableIds != null && rawDatabaseId == null && rawShare == null;
  const firstTableId = needsTableLookup
    ? Number(Array.isArray(rawTableIds) ? rawTableIds[0] : rawTableIds)
    : undefined;

  const { data: tableData } = useGetTableQuery(
    firstTableId != null ? { id: firstTableId } : skipToken,
  );

  useEffect(() => {
    if (tableData != null && needsTableLookup) {
      const url = Urls.dataStudioErdSchema(
        tableData.db_id,
        tableData.schema ?? "",
        [tableData.id as ConcreteTableId],
      );
      dispatch(push(url));
    }
  }, [tableData, needsTableLookup, dispatch]);

  // Persist last selection (database, schema, table IDs)
  const {
    value: lastSelectionRaw,
    setValue: setLastSelectionRaw,
    isLoading: isLoadingLastSelection,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: "last_database",
  });
  type LastSelection = {
    databaseId?: DatabaseId;
    schema?: string;
    tableIds?: number[];
  };
  const lastSelection = (lastSelectionRaw ?? undefined) as unknown as
    | LastSelection
    | undefined;
  const setLastSelection = setLastSelectionRaw as unknown as (
    value: LastSelection,
  ) => void;

  // Fetch databases to validate saved preference exists
  const { data: databasesResponse, isLoading: isLoadingDatabases } =
    useListDatabasesQuery();

  const databases = useMemo(
    () => databasesResponse?.data?.filter((db) => !db.is_saved_questions),
    [databasesResponse],
  );

  // Effective database/schema (from shared state or URL)
  const effectiveDatabaseId = sharedState?.databaseId ?? databaseId;
  const effectiveSchema = sharedState?.schema ?? schema;

  // Redirect to last selection only on initial load (not when user clears selection)
  const hasUrlSelection =
    databaseId != null || rawShare != null || rawTableIds != null;
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    if (hasRedirectedRef.current) {
      return;
    }

    if (
      !isLoadingLastSelection &&
      !isLoadingDatabases &&
      !hasUrlSelection &&
      lastSelection != null &&
      lastSelection.databaseId != null &&
      databases != null
    ) {
      const dbExists = databases.some(
        (db) => db.id === lastSelection.databaseId,
      );
      if (dbExists) {
        hasRedirectedRef.current = true;
        const tableIds =
          lastSelection.tableIds != null && lastSelection.tableIds.length > 0
            ? (lastSelection.tableIds as ConcreteTableId[])
            : undefined;
        const url =
          lastSelection.schema != null
            ? Urls.dataStudioErdSchema(
                lastSelection.databaseId,
                lastSelection.schema,
                tableIds,
              )
            : Urls.dataStudioErdDatabase(lastSelection.databaseId);
        dispatch(push(url));
      }
    }

    if (!isLoadingLastSelection && !isLoadingDatabases) {
      hasRedirectedRef.current = true;
    }
  }, [
    isLoadingLastSelection,
    isLoadingDatabases,
    hasUrlSelection,
    lastSelection,
    databases,
    dispatch,
  ]);

  // Save current selection — only persist when we have a table selection.
  // Save null when user clears GraphEntryInput (uses PUT, not DELETE, to avoid races).
  const effectiveTableIds = sharedState?.tableIds ?? initialTableIds;
  useEffect(() => {
    if (
      effectiveDatabaseId != null &&
      effectiveTableIds != null &&
      effectiveTableIds.length > 0
    ) {
      setLastSelection({
        databaseId: effectiveDatabaseId,
        schema: effectiveSchema,
        tableIds: effectiveTableIds as number[],
      });
    } else if (hasRedirectedRef.current && effectiveDatabaseId == null) {
      // Save empty object to clear — uses the same PUT endpoint so it always
      // overwrites any in-flight save (no PUT/DELETE race).
      // The redirect checks lastSelection.databaseId != null, so {} won't trigger it.
      setLastSelection({});
    }
  }, [
    effectiveDatabaseId,
    effectiveSchema,
    effectiveTableIds,
    setLastSelection,
  ]);

  return (
    <Stack h="100%">
      <SchemaViewer
        databaseId={effectiveDatabaseId}
        schema={effectiveSchema}
        initialTableIds={sharedState?.tableIds ?? initialTableIds}
      />
    </Stack>
  );
}
