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

/** Central state/data hook for the whole app: holds all workspace state and API-backed handlers consumed by the tab sections. */
export function useMetagraphWorkspace() {
  const [activeTab, setActiveTab] = useState("context-layer");
  const [sqlInput, setSqlInput] = useState(INITIAL_SQL);
  const [catalog, setCatalog] = useState([]);
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });
  const [selectedAssetName, setSelectedAssetName] = useState(null);
  const [userRole, setUserRole] = useState("ANALYST");
  const [ragQuery, setRagQuery] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [sessionId, setSessionId] = useState(null);
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

  /** Applies the editor's SQL to business-db via POST /api/exec. */
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

  /** Manually triggers syncUp() via POST /api/sync, then reloads the context-layer panels. */
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

  /** Confirms with the user, then wipes catalog/lineage/vector data via POST /api/purge and resets local state. */
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
      setChatMessages([]);
      setSessionId(null);
      setActionLog("Catalog purged.");
      await loadWorkspace();
      await loadContextLayer();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPurging(false);
    }
  }, [loadWorkspace, loadContextLayer]);

  /** Sends a chat query to POST /api/ask, appending a pending bubble that's replaced with the agent's reply (or an error) when it resolves. */
  const handleSendMessage = useCallback(
    async (event, query = ragQuery) => {
      event?.preventDefault();

      const trimmed = query.trim();
      if (!trimmed) {
        return;
      }

      const userMessageId = crypto.randomUUID();
      const pendingMessageId = crypto.randomUUID();

      setChatMessages((prev) => [
        ...prev,
        { id: userMessageId, role: "user", content: trimmed },
        { id: pendingMessageId, role: "assistant", content: "", pending: true },
      ]);
      setRagQuery("");
      setIsSearching(true);

      try {
        const data = await request("/api/ask", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: trimmed, userRole, sessionId }),
        });

        setSessionId(data.sessionId);
        setChatMessages((prev) => {
          const next = prev.filter((message) => message.id !== pendingMessageId);
          if (data.wasReset) {
            next.push({
              id: crypto.randomUUID(),
              role: "system",
              content: "Role changed - starting a fresh conversation context for this turn.",
            });
          }
          next.push({
            id: pendingMessageId,
            role: "assistant",
            content: data.answer,
            matchedTables: data.matchedTables || [],
            toolCalls: data.toolCalls || [],
            skillsLoaded: data.skillsLoaded || [],
          });
          return next;
        });
      } catch (err) {
        setChatMessages((prev) =>
          prev.map((message) =>
            message.id === pendingMessageId
              ? { ...message, content: `Something went wrong: ${err.message}`, pending: false, isError: true }
              : message,
          ),
        );
      } finally {
        setIsSearching(false);
      }
    },
    [ragQuery, sessionId, userRole],
  );

  /** Clears the chat transcript and starts a fresh agent session. */
  const handleNewChat = useCallback(() => {
    setChatMessages([]);
    setSessionId(null);
    setRagQuery("");
  }, []);

  return {
    actionLog,
    activeTab,
    businessDbTables,
    catalogDbTables,
    chatMessages,
    downstreamOfSelected,
    error,
    graphData,
    handleExec,
    handleNewChat,
    handlePurge,
    handleSendMessage,
    handleSyncNow,
    isLoading,
    isProcessing,
    isPurging,
    isSearching,
    isSyncing,
    piiColumnCount,
    ragQuery,
    riskHits,
    selectedAsset,
    selectedAssetName,
    sessionId,
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
