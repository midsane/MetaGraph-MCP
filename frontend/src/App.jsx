import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Network } from 'vis-network/standalone';
import {
  GitBranch, UploadCloud, Layers, ShieldAlert, Sparkles,
  Search, Play, Bell, Lock, Zap, ArrowUpRight, Settings,
  AlertTriangle, CheckCircle2, Radio
} from 'lucide-react';

/* -----------------------------------------------------------------
   TOKENS
   ink        #0B0B0E   page background
   rail       #0F1013   left nav rail
   panel      #17181C   card surface
   panel-2    #1D1E23   raised / hover surface
   line       #26272C   hairline
   text       #F5F5F3   primary text
   text-dim   #9B9CA3   secondary text
   text-faint #55565D   tertiary
   coral      #FF5A36   brand / hero accent
   crimson    #EF4444   PII / danger
   violet     #8B5CF6   secondary data accent
   amber      #F5B841   warning / flag
   emerald    #22C55E   positive / live
   cyan       #38BDF8   tertiary data accent
------------------------------------------------------------------ */

const NAV = [
  { id: 'ingest', icon: UploadCloud, label: 'Ingest' },
  { id: 'lineage', icon: GitBranch, label: 'Lineage' },
  { id: 'governance', icon: ShieldAlert, label: 'Governance' },
  { id: 'rag', icon: Sparkles, label: 'Ask' },
];

const PII_KEYWORDS = ['ssn', 'email', 'phone', 'dob', 'password', 'credit_card', 'address'];

function Sparkline({ values, color }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {values.map((v, i) => (
        <div key={i} className="w-[5px] rounded-sm" style={{ height: `${Math.max(v * 100, 8)}%`, background: color, opacity: 0.35 + v * 0.65 }} />
      ))}
    </div>
  );
}

function Pill({ children, tone = 'dim' }) {
  const tones = {
    dim: 'bg-white/5 text-[#9B9CA3]',
    good: 'bg-[#22C55E1a] text-[#22C55E]',
    warn: 'bg-[#F5B8411a] text-[#F5B841]',
    bad: 'bg-[#EF44441a] text-[#EF4444]',
    brand: 'bg-[#FF5A361a] text-[#FF5A36]',
  };
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tones[tone]}`}>{children}</span>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState('ingest');
  const [sqlInput, setSqlInput] = useState(
`CREATE TABLE raw_users (
  id UUID,
  full_name VARCHAR(255),
  email VARCHAR(255),
  ssn VARCHAR(11)
);

CREATE TABLE stg_users AS
SELECT id, full_name, email FROM raw_users;`
  );

  const [isProcessing, setIsProcessing] = useState(false);
  const [ingestLogs, setIngestLogs] = useState(null);

  const visJsRef = useRef(null);
  const networkRef = useRef(null);
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });

  const [selectedTable, setSelectedTable] = useState('raw_users');
  const [userRole, setUserRole] = useState('ANALYST');
  const [governedSchema, setGovernedSchema] = useState(null);

  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState([]);

  // --- derived, live PII risk scan over the editor contents ---
  const riskHits = useMemo(() => {
    const lines = sqlInput.split('\n');
    const hits = [];
    lines.forEach((line) => {
      const colMatch = line.match(/^\s*(\w+)\s+(VARCHAR|INT|UUID|TEXT|DATE|CHAR)/i);
      if (colMatch) {
        const colName = colMatch[1].toLowerCase();
        if (PII_KEYWORDS.some(k => colName.includes(k))) hits.push(colMatch[1]);
      }
    });
    return hits;
  }, [sqlInput]);

  const statementCount = useMemo(
    () => sqlInput.split(';').map(s => s.trim()).filter(Boolean).length,
    [sqlInput]
  );

  // --- 1. INGESTION HANDLER ---
  const handleIngest = async () => {
    setIsProcessing(true);
    setIngestLogs('$ parsing SQL ASTs and dispatching to Scribe Agent...');
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sqlContent: sqlInput })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ingestion failed');

      setIngestLogs(`✓ ingested ${data.tables.length} table${data.tables.length === 1 ? '' : 's'}\n\n${JSON.stringify(data.tables, null, 2)}`);
      setLineageData(data.lineage);
      setActiveTab('lineage');
    } catch (err) {
      setIngestLogs(`✗ ${err.message}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // --- 2. LINEAGE RENDERER ---
  useEffect(() => {
    if (activeTab !== 'lineage' || !visJsRef.current || !lineageData.nodes.length) return;

    const nodes = lineageData.nodes.map(n => ({
      id: n.id, label: `  ${n.label}  `, shape: 'box',
      color: { background: '#17181C', border: '#FF5A36', highlight: { background: '#1D1E23', border: '#FF5A36' } },
      borderWidth: 1.5,
      font: { color: '#F5F5F3', face: 'JetBrains Mono, monospace', size: 13 },
      margin: 14,
      shapeProperties: { borderRadius: 8 }
    }));

    const edges = lineageData.edges.map(e => ({
      from: e.from, to: e.to, arrows: { to: { enabled: true, scaleFactor: 0.6 } },
      color: { color: '#33343A', highlight: '#FF5A36' }, width: 1.5, smooth: { type: 'cubicBezier', roundness: 0.5 }
    }));

    networkRef.current = new Network(visJsRef.current, { nodes, edges }, {
      physics: { hierarchicalRepulsion: { nodeDistance: 160 } },
      layout: { hierarchical: { direction: 'LR', sortMethod: 'directed' } }
    });
  }, [activeTab, lineageData]);

  // --- 3. MCP GOVERNANCE (HTTP Mock) ---
  const fetchGovernedSchema = async () => {
    try {
      const res = await fetch(`/api/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: selectedTable, topK: 1 })
      });
      const data = await res.json();

      let schema = data.matches[0];
      if (schema && userRole === 'ANALYST') {
        schema.columns = schema.columns.map(c =>
          c.is_pii ? { ...c, description: 'Requires ADMIN role to view', redacted: true } : c
        );
      }
      setGovernedSchema(schema);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (activeTab === 'governance') fetchGovernedSchema();
  }, [activeTab, userRole, selectedTable]);

  // --- 4. RAG SEARCH ---
  const handleRagSearch = async (e, overrideQuery) => {
    if (e && e.preventDefault) e.preventDefault();
    const q = overrideQuery ?? ragQuery;
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, topK: 3 })
      });
      const data = await res.json();
      setRagResults(data.matches || []);
    } catch (err) {
      console.error(err);
    }
  };

  const lineCount = sqlInput.split('\n').length;
  const piiCount = governedSchema?.columns?.filter(c => c.is_pii).length || 0;

  const suggestions = [
    'Which table contains social security numbers?',
    'What changed in stg_users this week?',
    'Show me every column flagged as PII',
  ];

  return (
    <div className="min-h-screen bg-[#0B0B0E] text-[#F5F5F3] flex" style={{ fontFamily: "Inter, ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'JetBrains Mono', ui-monospace, monospace; }
        ::selection { background: #FF5A3633; }
        textarea:focus, input:focus, select:focus { outline: none; }
      `}</style>

      {/* LEFT RAIL */}
      <aside className="w-16 shrink-0 border-r border-[#1D1E23] bg-[#0F1013] flex flex-col items-center py-4 gap-6">
        <div className="w-9 h-9 rounded-xl bg-[#FF5A36] flex items-center justify-center shrink-0">
          <GitBranch className="w-4.5 h-4.5 text-white" strokeWidth={2.5} />
        </div>
        <nav className="flex flex-col gap-2">
          {NAV.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              title={tab.label}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                activeTab === tab.id
                  ? 'bg-[#1D1E23] text-[#FF5A36] ring-1 ring-[#FF5A36]/40'
                  : 'text-[#55565D] hover:text-[#9B9CA3] hover:bg-[#17181C]'
              }`}
            >
              <tab.icon className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          ))}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-4">
          <Settings className="w-4.5 h-4.5 text-[#55565D]" />
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#8B5CF6] to-[#FF5A36]" />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* TOP HEADER */}
        <header className="flex items-center justify-between px-8 py-5 shrink-0">
          <div>
            <h1 className="text-[22px] font-extrabold tracking-tight capitalize">{NAV.find(n => n.id === activeTab)?.label}</h1>
            <p className="text-[13px] text-[#55565D] mt-0.5">metagraph · schema catalog & governance</p>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:flex items-center gap-1.5 text-[12px] font-medium text-[#9B9CA3] bg-[#17181C] border border-[#26272C] px-3 py-1.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-[#22C55E] animate-pulse" /> qdrant live
            </span>
            <button className="w-9 h-9 rounded-full bg-[#17181C] border border-[#26272C] flex items-center justify-center hover:bg-[#1D1E23] transition-colors">
              <Bell className="w-4 h-4 text-[#9B9CA3]" />
            </button>
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[#38BDF8] to-[#8B5CF6] flex items-center justify-center text-[12px] font-bold">MG</div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto px-8 pb-8">

          {/* TAB 1: INGEST */}
          {activeTab === 'ingest' && (
            <div className="flex flex-col gap-5">
              {/* stat row */}
              <div className="grid grid-cols-3 gap-5">
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex flex-col justify-between">
                  <span className="text-[12px] text-[#9B9CA3] font-medium">Lines of SQL</span>
                  <div className="flex items-end justify-between mt-3">
                    <span className="text-[30px] font-extrabold tracking-tight">{lineCount}</span>
                    <Sparkline color="#FF5A36" values={[0.3, 0.5, 0.4, 0.7, 0.6, 0.9, 0.8]} />
                  </div>
                </div>
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex flex-col justify-between">
                  <span className="text-[12px] text-[#9B9CA3] font-medium">Statements queued</span>
                  <div className="flex items-end justify-between mt-3">
                    <span className="text-[30px] font-extrabold tracking-tight">{statementCount}</span>
                    <Sparkline color="#8B5CF6" values={[0.6, 0.4, 0.5, 0.5, 0.7, 0.3, 0.6]} />
                  </div>
                </div>
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex flex-col justify-between">
                  <span className="text-[12px] text-[#9B9CA3] font-medium">Tables in graph</span>
                  <div className="flex items-end justify-between mt-3">
                    <span className="text-[30px] font-extrabold tracking-tight">{lineageData.nodes.length}</span>
                    <Sparkline color="#38BDF8" values={[0.2, 0.3, 0.5, 0.4, 0.6, 0.5, 0.8]} />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-5 flex-1 min-h-0">
                {/* editor */}
                <div className="col-span-2 bg-[#17181C] border border-[#26272C] rounded-[20px] flex flex-col overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#26272C]">
                    <div className="flex items-center gap-2.5">
                      <div className="flex gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full bg-[#26272C]" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#26272C]" />
                        <span className="w-2.5 h-2.5 rounded-full bg-[#26272C]" />
                      </div>
                      <span className="mono text-[12px] text-[#9B9CA3] ml-1">migration.sql</span>
                    </div>
                    <span className="mono text-[11px] text-[#55565D]">{lineCount} lines</span>
                  </div>
                  <div className="flex-1 flex overflow-hidden">
                    <div className="mono text-[13px] leading-[22px] text-[#33343A] text-right pr-3 pl-4 py-4 select-none">
                      {Array.from({ length: lineCount }).map((_, i) => <div key={i}>{i + 1}</div>)}
                    </div>
                    <textarea
                      className="flex-1 bg-transparent p-4 mono text-[13px] leading-[22px] text-[#FF8F6E] resize-none w-full"
                      value={sqlInput}
                      spellCheck={false}
                      onChange={(e) => setSqlInput(e.target.value)}
                    />
                  </div>
                </div>

                {/* right column */}
                <div className="flex flex-col gap-5 min-h-0">
                  <div className="bg-gradient-to-br from-[#FF5A36] to-[#E8431F] rounded-[20px] p-5 flex flex-col shrink-0">
                    <Zap className="w-5 h-5 text-white/90 mb-3" fill="white" />
                    <h3 className="text-[15px] font-bold text-white leading-snug">Run the pipeline</h3>
                    <p className="text-[12.5px] text-white/80 mt-1.5 leading-relaxed">Extract schemas, build lineage, and auto-flag PII columns from the SQL on the left.</p>
                    <button
                      onClick={handleIngest} disabled={isProcessing}
                      className="mt-4 bg-white text-[#1a1a1a] px-4 py-2.5 rounded-xl text-[13px] font-semibold flex items-center justify-center gap-2 disabled:opacity-50 hover:bg-white/90 transition-colors"
                    >
                      <Play className="w-3.5 h-3.5" fill="currentColor" /> {isProcessing ? 'Running…' : 'Run pipeline'}
                    </button>
                  </div>

                  <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex-1 min-h-0 flex flex-col overflow-hidden">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-[13px] font-semibold">PII risk scan</h3>
                      {riskHits.length > 0 ? <Pill tone="bad">{riskHits.length} flagged</Pill> : <Pill tone="good">clear</Pill>}
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2">
                      {riskHits.length > 0 ? riskHits.map((h, i) => (
                        <div key={i} className="flex items-center gap-2 text-[12.5px] bg-[#EF44440d] border border-[#EF444422] rounded-lg px-3 py-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-[#EF4444] shrink-0" />
                          <span className="mono text-[#F5F5F3]">{h}</span>
                          <span className="text-[#9B9CA3] ml-auto">will be redacted</span>
                        </div>
                      )) : (
                        <div className="flex items-center gap-2 text-[12.5px] text-[#55565D]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#22C55E]" /> No sensitive columns detected
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {ingestLogs && (
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 h-36 overflow-y-auto shrink-0">
                  <div className="mono text-[11px] text-[#55565D] mb-2">output</div>
                  <pre className="mono text-[12.5px] text-[#22C55E] whitespace-pre-wrap leading-relaxed">{ingestLogs}</pre>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: LINEAGE */}
          {activeTab === 'lineage' && (
            <div className="flex flex-col gap-5 h-full">
              <div className="grid grid-cols-2 gap-5">
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex items-center justify-between">
                  <div>
                    <span className="text-[12px] text-[#9B9CA3] font-medium">Tables</span>
                    <div className="text-[26px] font-extrabold tracking-tight mt-1">{lineageData.nodes.length}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#FF5A361a] flex items-center justify-center">
                    <Layers className="w-4.5 h-4.5 text-[#FF5A36]" />
                  </div>
                </div>
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex items-center justify-between">
                  <div>
                    <span className="text-[12px] text-[#9B9CA3] font-medium">Relationships</span>
                    <div className="text-[26px] font-extrabold tracking-tight mt-1">{lineageData.edges.length}</div>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-[#38BDF81a] flex items-center justify-center">
                    <GitBranch className="w-4.5 h-4.5 text-[#38BDF8]" />
                  </div>
                </div>
              </div>

              <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex-1 flex flex-col min-h-[420px]">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-[13px] font-semibold">Active SQL lineage</h2>
                  <div className="flex items-center gap-4 mono text-[11px] text-[#9B9CA3]">
                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm border border-[#FF5A36]" /> table</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-px bg-[#33343A]" /> derives</span>
                  </div>
                </div>
                {lineageData.nodes.length ? (
                  <div ref={visJsRef} className="flex-1 bg-[#0F1013] border border-[#26272C] rounded-2xl" />
                ) : (
                  <div className="flex-1 bg-[#0F1013] border border-dashed border-[#26272C] rounded-2xl flex items-center justify-center">
                    <p className="text-[13px] text-[#55565D]">No lineage yet — run the ingestion pipeline to generate a graph.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOVERNANCE */}
          {activeTab === 'governance' && (
            <div className="flex flex-col gap-5">
              <div className="grid grid-cols-3 gap-5">
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5">
                  <span className="text-[12px] text-[#9B9CA3] font-medium">Total columns</span>
                  <div className="text-[26px] font-extrabold tracking-tight mt-1">{governedSchema?.columns?.length || 0}</div>
                </div>
                <div className="bg-gradient-to-br from-[#EF4444] to-[#C22F2F] rounded-[20px] p-5">
                  <span className="text-[12px] text-white/80 font-medium">PII flagged</span>
                  <div className="text-[26px] font-extrabold tracking-tight text-white mt-1">{piiCount}</div>
                </div>
                <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] p-5 flex flex-col justify-between">
                  <span className="text-[12px] text-[#9B9CA3] font-medium">Viewing as</span>
                  <Pill tone={userRole === 'ADMIN' ? 'brand' : 'bad'}>{userRole}</Pill>
                </div>
              </div>

              <div className="bg-[#17181C] border border-[#26272C] rounded-[20px] overflow-hidden">
                <div className="flex items-center justify-between px-6 py-4 border-b border-[#26272C]">
                  <div>
                    <h2 className="text-[13px] font-semibold flex items-center gap-2">
                      <span className="mono text-[11px] text-[#FF5A36] bg-[#FF5A361a] rounded px-1.5 py-0.5">tool</span>
                      get_governed_schema
                    </h2>
                    <p className="text-[12px] text-[#55565D] mt-1.5">Exposes schema context to AI agents. Columns tagged PII are masked by role.</p>
                  </div>
                  <div className="flex gap-3 items-center">
                    <select
                      value={selectedTable} onChange={(e) => setSelectedTable(e.target.value)}
                      className="bg-[#0F1013] border border-[#26272C] mono text-[12px] text-[#9B9CA3] rounded-xl px-3 py-2"
                    >
                      <option value="raw_users">raw_users</option>
                      <option value="stg_users">stg_users</option>
                    </select>
                    <div className="flex items-center gap-1 bg-[#0F1013] border border-[#26272C] p-1 rounded-xl">
                      <button
                        onClick={() => setUserRole('ADMIN')}
                        className={`px-3 py-1.5 text-[12px] rounded-lg font-medium transition-colors ${userRole === 'ADMIN' ? 'bg-[#FF5A361a] text-[#FF5A36]' : 'text-[#55565D] hover:text-[#9B9CA3]'}`}
                      >Admin</button>
                      <button
                        onClick={() => setUserRole('ANALYST')}
                        className={`px-3 py-1.5 text-[12px] rounded-lg font-medium flex items-center gap-1.5 transition-colors ${userRole === 'ANALYST' ? 'bg-[#EF44441a] text-[#EF4444]' : 'text-[#55565D] hover:text-[#9B9CA3]'}`}
                      ><Lock className="w-3 h-3" />Analyst</button>
                    </div>
                  </div>
                </div>

                {governedSchema ? (
                  <>
                    <div className="px-6 py-4 border-b border-[#26272C]">
                      <h3 className="mono text-[14px] font-medium">{governedSchema.tableName}</h3>
                      <p className="text-[12.5px] text-[#9B9CA3] mt-1">{governedSchema.business_description}</p>
                    </div>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="mono text-[10.5px] uppercase tracking-wider text-[#55565D] border-b border-[#26272C]">
                          <th className="py-2.5 pl-6 w-8"></th>
                          <th className="py-2.5 pr-4 font-medium">Column</th>
                          <th className="py-2.5 pr-4 font-medium">Description</th>
                          <th className="py-2.5 pr-6 font-medium">Flag</th>
                        </tr>
                      </thead>
                      <tbody>
                        {governedSchema.columns?.map((col, i) => {
                          const redacted = !!col.redacted;
                          return (
                            <tr key={i} className={`border-b border-[#26272C] ${redacted ? 'bg-[#EF444408]' : ''}`}>
                              <td className="py-3 pl-6 mono text-[13px] select-none">
                                {redacted
                                  ? <span className="text-[#EF4444]">−</span>
                                  : col.is_pii
                                    ? <span className="text-[#F5B841]">!</span>
                                    : <span className="text-[#33343A]">·</span>}
                              </td>
                              <td className={`py-3 pr-4 mono text-[13px] ${redacted ? 'text-[#EF4444]/70 line-through decoration-[#EF4444]/40' : 'text-[#38BDF8]'}`}>
                                {col.name}
                              </td>
                              <td className={`py-3 pr-4 text-[13px] ${redacted ? 'text-[#EF4444]/80' : 'text-[#9B9CA3]'}`}>
                                {col.description}
                              </td>
                              <td className="py-3 pr-6">
                                {col.is_pii && <Pill tone="warn">PII</Pill>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </>
                ) : (
                  <div className="py-16 flex items-center justify-center">
                    <p className="text-[13px] text-[#55565D]">No schema found — ingest SQL first.</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: RAG */}
          {activeTab === 'rag' && (
            <div className="flex flex-col gap-5">
              <div className="bg-gradient-to-br from-[#8B5CF6] to-[#5B3FD6] rounded-[20px] p-6">
                <Sparkles className="w-5 h-5 text-white/90 mb-3" />
                <h2 className="text-[17px] font-bold text-white">Ask the catalog anything</h2>
                <p className="text-[13px] text-white/80 mt-1 max-w-md">Semantic search over table and column metadata — plain English in, ranked matches out.</p>
                <form onSubmit={handleRagSearch} className="mt-4 relative max-w-xl">
                  <Search className="w-4 h-4 text-[#8B5CF6] absolute left-4 top-1/2 -translate-y-1/2" />
                  <input
                    type="text" value={ragQuery} onChange={(e) => setRagQuery(e.target.value)}
                    placeholder="Which table contains social security numbers?"
                    className="w-full bg-white text-[#1a1a1a] text-[13px] rounded-xl pl-11 pr-4 py-3.5 placeholder:text-[#8a8a8a]"
                  />
                </form>
                <div className="flex flex-wrap gap-2 mt-3">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => { setRagQuery(s); handleRagSearch(null, s); }}
                      className="text-[11.5px] text-white/90 bg-white/10 hover:bg-white/20 transition-colors px-3 py-1.5 rounded-full"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3">
                {ragResults.length ? ragResults.map((res, i) => (
                  <div key={i} className="bg-[#17181C] border border-[#26272C] p-4 rounded-2xl hover:border-[#33343A] transition-colors flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#38BDF81a] flex items-center justify-center shrink-0">
                      <Layers className="w-4.5 h-4.5 text-[#38BDF8]" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between items-center mb-1">
                        <span className="mono text-[13px] text-[#F5F5F3] font-medium">{res.tableName}</span>
                        <ArrowUpRight className="w-3.5 h-3.5 text-[#55565D]" />
                      </div>
                      <p className="text-[12.5px] text-[#9B9CA3] truncate">{res.business_description}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <div className="w-16 h-1 rounded-full bg-[#26272C] overflow-hidden">
                        <div className="h-full bg-[#22C55E]" style={{ width: `${Math.round((res.similarity_score || 0) * 100)}%` }} />
                      </div>
                      <span className="mono text-[10.5px] text-[#55565D]">{res.similarity_score}</span>
                    </div>
                  </div>
                )) : (
                  <div className="py-16 flex items-center justify-center">
                    <p className="text-[13px] text-[#55565D]">Results will appear here.</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}