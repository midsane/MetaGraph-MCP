import { useCallback, useEffect, useMemo, useState } from "react";
import { ACCENTS, INITIAL_SQL, NAV } from "./constants.ts";
import { request } from "./api.ts";
import {
  buildGraphData,
  buildSuggestions,
  getRiskHits,
  getStatementCount,
} from "./utils.ts";

export function useMetagraphWorkspace() {
  const [activeTab, setActiveTab] = useState("ingest");
  const [sqlInput, setSqlInput] = useState(INITIAL_SQL);
  const [catalog, setCatalog] = useState([]);
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });
  const [selectedTable, setSelectedTable] = useState("");
  const [userRole, setUserRole] = useState("ANALYST");
  const [governedSchema, setGovernedSchema] = useState(null);
  const [ragQuery, setRagQuery] = useState("");
  const [ragResult, setRagResult] = useState(null);
  const [ingestLogs, setIngestLogs] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

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

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadWorkspace();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadWorkspace]);

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

  const handleIngest = useCallback(async () => {
    setIsProcessing(true);
    setError("");
    setIngestLogs("Parsing SQL and enriching table metadata…");

    try {
      const data = await request("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sqlContent: sqlInput }),
      });

      setIngestLogs(
        `Ingestion complete. Registered ${data.tables?.length || 0} table(s).`,
      );
      await loadWorkspace();
      setActiveTab("lineage");
    } catch (err) {
      setIngestLogs(`Ingestion failed: ${err.message}`);
      setError(err.message);
    } finally {
      setIsProcessing(false);
    }
  }, [loadWorkspace, sqlInput]);

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
      setIngestLogs("Catalog purged.");
      await loadWorkspace();
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPurging(false);
    }
  }, [loadWorkspace]);

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
          body: JSON.stringify({ query, topK: 6 }),
        });

        setRagResult(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setIsSearching(false);
      }
    },
    [ragQuery],
  );

  return {
    activeAccent,
    activeNav,
    activeTab,
    catalog,
    error,
    governedSchema: effectiveGovernedSchema,
    graphData,
    handleIngest,
    handlePurge,
    handleSearch,
    ingestLogs,
    isLoading,
    isProcessing,
    isPurging,
    isSearching,
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
    userRole,
  };
}
