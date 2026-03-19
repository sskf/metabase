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
  hops?: string;
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
  const rawHops = location?.query?.hops;
  const schema = location?.query?.schema;

  const databaseId: DatabaseId | undefined =
    rawDatabaseId != null ? Number(rawDatabaseId) : undefined;
  const initialHops: number | undefined =
    rawHops != null ? Number(rawHops) : undefined;

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

  // Persist last opened database/schema
  // Stores { databaseId, schema } under schema_viewer namespace
  // The UserKeyValue type for schema_viewer expects { table_ids, hops } shape,
  // but the last_database key stores a different shape — cast accordingly
  const {
    value: lastDatabaseRaw,
    setValue: setLastDatabaseRaw,
    isLoading: isLoadingLastDatabase,
  } = useUserKeyValue({
    namespace: "schema_viewer",
    key: "last_database",
  });
  const lastDatabase = lastDatabaseRaw as unknown as
    | { databaseId: DatabaseId; schema?: string }
    | undefined;
  const setLastDatabase = setLastDatabaseRaw as unknown as (value: {
    databaseId: DatabaseId;
    schema?: string;
  }) => void;

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

  // Redirect to last opened database only on initial load (not when user clears selection)
  const hasUrlSelection =
    databaseId != null || rawShare != null || rawTableIds != null;
  const hasRedirectedRef = useRef(false);

  useEffect(() => {
    // Only redirect once on initial load
    if (hasRedirectedRef.current) {
      return;
    }

    if (
      !isLoadingLastDatabase &&
      !isLoadingDatabases &&
      !hasUrlSelection &&
      lastDatabase != null &&
      databases != null
    ) {
      // Validate saved database still exists
      const dbExists = databases.some(
        (db) => db.id === lastDatabase.databaseId,
      );
      if (dbExists) {
        hasRedirectedRef.current = true;
        const url =
          lastDatabase.schema != null
            ? Urls.dataStudioErdSchema(
                lastDatabase.databaseId,
                lastDatabase.schema,
              )
            : Urls.dataStudioErdDatabase(lastDatabase.databaseId);
        dispatch(push(url));
      }
    }

    // Mark as "redirected" even if we didn't redirect (no saved db or db doesn't exist)
    // This prevents future redirects when user clears selection
    if (!isLoadingLastDatabase && !isLoadingDatabases) {
      hasRedirectedRef.current = true;
    }
  }, [
    isLoadingLastDatabase,
    isLoadingDatabases,
    hasUrlSelection,
    lastDatabase,
    databases,
    dispatch,
  ]);

  // Save current database/schema as last opened
  useEffect(() => {
    if (effectiveDatabaseId != null) {
      setLastDatabase({
        databaseId: effectiveDatabaseId,
        schema: effectiveSchema,
      });
    }
  }, [effectiveDatabaseId, effectiveSchema, setLastDatabase]);

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
