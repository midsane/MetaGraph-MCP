import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCENTS, INITIAL_SQL, NAV } from "./constants.ts";
import { request } from "./api.ts";
import {
  buildGraphData,
  buildSuggestions,
  getRiskHits,
  getStatementCount,
} from "./utils.ts";

const SYNC_TAB_POLL_MS = 3000;

export function useMetagraphWorkspace() {
  const [activeTab, setActiveTab] = useState("sync");
  const [sqlInput, setSqlInput] = useState(INITIAL_SQL);
  const [catalog, setCatalog] = useState([]);
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });
  const [selectedTable, setSelectedTable] = useState("");
  const [userRole, setUserRole] = useState("ANALYST");
  const [governedSchema, setGovernedSchema] = useState(null);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [actionLog, setActionLog] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // The "before" (business-db) and "after" (catalog-db) views for the Sync
  // Demo tab, plus the watermark so the demo can show what syncUp() has
  // processed so far.
  const [businessDbTables, setBusinessDbTables] = useState([]);
  const [catalogDbTables, setCatalogDbTables] = useState([]);
  const [syncWatermark, setSyncWatermark] = useState(0);

  const loadWorkspace = useCallback(async () => {
    setIsLoading(true);

    try {
      const [catalogResponse, lineageResponse] = await Promise.all([
        request("/api/catalog"),
        request("/api/lineage"),
      ]);

      const tables = catalogResponse.tables || [];
      setCatalog(tables);
      setSelectedTable((current) =>
        tables.some((table) => table.tableName === current)
          ? current
          : tables[0]?.tableName || "",
      );
      setLineageData(lineageResponse);
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Business-db (ground truth) vs catalog-db (what syncUp() has documented)
  // side by side, so the Sync Demo tab can show the event-driven pipeline
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

  // While the Sync Demo tab is open, poll business-db/catalog-db/lineage so
  // changes applied via /api/exec show up on their own once the event
  // listener (npm run sync:watch) reacts - no manual refresh needed.
  useEffect(() => {
    if (activeTab !== "sync") {
      return undefined;
    }

    let cancelled = false;
    const tick = () => {
      if (!cancelled) void loadContextLayer();
    };

    tick();
    const intervalId = window.setInterval(tick, SYNC_TAB_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [activeTab, loadContextLayer]);

  useEffect(() => {
    if (activeTab !== "governance" || !selectedTable) {
      return undefined;
    }

    let cancelled = false;

    const fetchGovernance = async () => {
      try {
        const data = await request(
          `/api/governance/${encodeURIComponent(selectedTable)}?role=${userRole}`,
        );

        if (!cancelled) {
          setGovernedSchema(data);
        }
      } catch (err) {
        if (!cancelled) {
          setGovernedSchema(null);
          setError(err.message);
        }
      }
    };

    fetchGovernance();

    return () => {
      cancelled = true;
    };
  }, [activeTab, selectedTable, userRole]);

  const riskHits = useMemo(() => getRiskHits(sqlInput), [sqlInput]);
  const statementCount = useMemo(() => getStatementCount(sqlInput), [sqlInput]);
  const effectiveGovernedSchema = selectedTable ? governedSchema : null;
  const piiCount = effectiveGovernedSchema?.piiColumnCount || 0;
  const graphData = useMemo(
    () => buildGraphData(lineageData, catalog),
    [catalog, lineageData],
  );
  const activeNav = useMemo(
    () => NAV.find((tab) => tab.id === activeTab),
    [activeTab],
  );
  const activeAccent = ACCENTS[activeNav?.accent || "amber"];
  const suggestions = useMemo(() => buildSuggestions(catalog), [catalog]);

  const handleExec = useCallback(async () => {
    setIsProcessing(true);
    setError("");
    setActionLog("Applying SQL to business-db…");

    try {
      await request("/api/exec", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sqlContent: sqlInput }),
      });

      setActionLog(
        "SQL applied to business-db. Watching for the event-driven sync to pick it up (requires `npm run sync:watch` running) — the panels below refresh automatically.",
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
      setGovernedSchema(null);
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
    activeAccent,
    activeNav,
    activeTab,
    businessDbTables,
    catalog,
    catalogDbTables,
    error,
    governedSchema: effectiveGovernedSchema,
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
    loadWorkspace,
    piiCount,
    ragQuery,
    ragResult,
    riskHits,
    selectedTable,
    setActiveTab,
    setError,
    setRagQuery,
    setSelectedTable,
    setSqlInput,
    setUserRole,
    sqlInput,
    statementCount,
    suggestions,
    syncWatermark,
    userRole,
  };
}
