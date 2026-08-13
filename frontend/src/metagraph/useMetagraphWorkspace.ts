import { useCallback, useEffect, useMemo, useState } from "react";
import { INITIAL_SQL } from "./constants.ts";
import { request } from "./api.ts";
import {
  buildGraphData,
  buildSuggestions,
  getRiskHits,
  getStatementCount,
} from "./utils.ts";

const CONTEXT_LAYER_POLL_TABS = new Set(["business-db", "context-layer"]);
const POLL_MS = 3000;

export function useMetagraphWorkspace() {
  const [activeTab, setActiveTab] = useState("context-layer");
  const [sqlInput, setSqlInput] = useState(INITIAL_SQL);
  const [catalog, setCatalog] = useState([]);
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });
  const [selectedAssetName, setSelectedAssetName] = useState(null);
  const [userRole, setUserRole] = useState("ANALYST");
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [actionLog, setActionLog] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // The "before" (business-db) and "after" (catalog-db) views, plus the
  // watermark so the UI can show what syncUp() has processed so far.
  const [businessDbTables, setBusinessDbTables] = useState([]);
  const [catalogDbTables, setCatalogDbTables] = useState([]);
  const [syncWatermark, setSyncWatermark] = useState(0);

  // Powers the Ask a Question suggestion chips only.
  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const catalogResponse = await request("/api/catalog");
      setCatalog(catalogResponse.tables || []);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Business-db (ground truth) vs catalog-db (what syncUp() has documented)
  // plus the lineage graph, so the UI can show the event-driven pipeline
  // catching up on its own.
  const loadContextLayer = useCallback(async () => {
    try {
      const [businessResponse, catalogResponse, lineageResponse] = await Promise.all([
        request("/api/retrieve-business-db"),
        request("/api/retrieve-catalog-db"),
        request("/api/lineage"),
      ]);

      setBusinessDbTables(businessResponse.tables || []);
      setCatalogDbTables(catalogResponse.tables || []);
      setSyncWatermark(catalogResponse.syncWatermark ?? 0);
      setLineageData(lineageResponse);
      setError("");
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadWorkspace]);

  // While Update Business DB or Context Layer is open, poll so changes
  // applied via /api/exec show up on their own once the event listener
  // (npm run sync:watch) reacts - no manual refresh needed.
  useEffect(() => {
    if (!CONTEXT_LAYER_POLL_TABS.has(activeTab)) {
      return undefined;
    }

    let cancelled = false;
    const tick = () => {
      if (!cancelled) void loadContextLayer();
    };

    tick();
    const intervalId = window.setInterval(tick, POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTab, loadContextLayer]);

  const riskHits = useMemo(() => getRiskHits(sqlInput), [sqlInput]);
  const statementCount = useMemo(() => getStatementCount(sqlInput), [sqlInput]);
  const graphData = useMemo(
    () => buildGraphData(lineageData, catalogDbTables),
    [catalogDbTables, lineageData],
  );
  const suggestions = useMemo(() => buildSuggestions(catalog), [catalog]);

  const selectedAsset = useMemo(
    () => catalogDbTables.find((table) => table.tableName === selectedAssetName) || null,
    [catalogDbTables, selectedAssetName],
  );
  const upstreamOfSelected = useMemo(
    () => (selectedAssetName ? graphData.edges.filter((edge) => edge.to === selectedAssetName).map((edge) => edge.from) : []),
    [graphData, selectedAssetName],
  );
  const downstreamOfSelected = useMemo(
    () => (selectedAssetName ? graphData.edges.filter((edge) => edge.from === selectedAssetName).map((edge) => edge.to) : []),
    [graphData, selectedAssetName],
  );
  const piiColumnCount = useMemo(
    () => catalogDbTables.reduce((sum, table) => sum + table.columns.filter((column) => column.isPii).length, 0),
    [catalogDbTables],
  );

  const handleExec = useCallback(async () => {
    setIsProcessing(true);
    setError("");
    setActionLog("Applying SQL to business-db…");

    try {
      const data = await request("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sqlContent: sqlInput }),
      });

      setActionLog(
        `${data.message} Watching for the event-driven sync to pick it up (requires \`npm run sync:watch\` running) — panels refresh automatically.`,
      );
    } catch (err) {
      setActionLog(`Failed to apply SQL: ${err.message}`);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [sqlInput]);

  const handleSyncNow = useCallback(async () => {
    setIsSyncing(true);
    setError("");
    setActionLog("Running syncUp() manually…");

    try {
      const result = await request("/api/sync", { method: "POST" });
      setActionLog(
        `Sync complete — new: ${result.newTables.length}, changed: ${result.changedTables.length}, dropped: ${result.droppedTables.length}, query logs processed: ${result.queryLogsProcessed}, lineage edges added: ${result.lineageEdgesAdded}.`,
      );
      await loadContextLayer();
    } catch (err) {
      setActionLog(`Sync failed: ${err.message}`);
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  }, [loadContextLayer]);

  const handlePurge = useCallback(async () => {
    if (
      !window.confirm("Purge all catalog metadata and lineage from Qdrant?")
    ) {
      return;
    }

    setIsPurging(true);

    try {
      await request("/api/purge", { method: "POST" });
      setSelectedAssetName(null);
      setRagResult(null);
      setActionLog("Catalog purged.");
      await loadWorkspace();
      await loadContextLayer();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPurging(false);
    }
  }, [loadWorkspace, loadContextLayer]);

  const handleSearch = useCallback(
    async (event, query = ragQuery) => {
      event?.preventDefault();

      if (!query.trim()) {
        return;
      }

      setIsSearching(true);
      setError("");

      try {
        const data = await request("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, topK: 6, userRole }),
        });

        setRagResult(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSearching(false);
      }
    },
    [ragQuery, userRole],
  );

  return {
    actionLog,
    activeTab,
    businessDbTables,
    catalogDbTables,
    downstreamOfSelected,
    error,
    graphData,
    handleExec,
    handlePurge,
    handleSearch,
    handleSyncNow,
    isLoading,
    isProcessing,
    isPurging,
    isSearching,
    isSyncing,
    piiColumnCount,
    ragQuery,
    ragResult,
    riskHits,
    selectedAsset,
    selectedAssetName,
    setActiveTab,
    setError,
    setRagQuery,
    setSelectedAssetName,
    setSqlInput,
    setUserRole,
    sqlInput,
    statementCount,
    suggestions,
    syncWatermark,
    upstreamOfSelected,
    userRole,
  };
}
