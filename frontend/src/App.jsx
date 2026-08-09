import React, { useState, useEffect, useRef } from 'react';
import { Network } from 'vis-network/standalone';
import { 
  Database, 
  Search, 
  Bot, 
  RefreshCw, 
  Terminal, 
  ExternalLink,
  Layers,
  Activity,
  CheckCircle2,
  Lock
} from 'lucide-react';

export default function App() {
  const [lineageData, setLineageData] = useState({ nodes: [], edges: [] });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  
  const [tableName, setTableName] = useState('raw_customers');
  const [columnsInput, setColumnsInput] = useState('customer_id, full_name, email_address, user_ssn');
  const [ingestOutput, setIngestOutput] = useState(null);
  const [ingesting, setIngesting] = useState(false);

  const visJsRef = useRef(null);
  const networkRef = useRef(null);

  const fetchLineage = async () => {
    try {
      const res = await fetch('/api/lineage');
      const data = await res.json();
      setLineageData(data);
    } catch (err) {
      console.error('Failed to fetch lineage:', err);
    }
  };

  useEffect(() => {
    fetchLineage();
  }, []);

  useEffect(() => {
    if (!visJsRef.current || !lineageData.nodes.length) return;

    const formattedNodes = lineageData.nodes.map(n => ({
      id: n.id,
      label: ` ${n.label} `,
      shape: 'box',
      color: { 
        background: '#131c2e', 
        border: '#0284c7', 
        highlight: { background: '#0369a1', border: '#38bdf8' } 
      },
      font: { color: '#f8fafc', face: 'monospace', size: 13 },
      margin: 12
    }));

    const formattedEdges = lineageData.edges.map(e => ({
      from: e.from,
      to: e.to,
      arrows: 'to',
      color: { color: '#475569', highlight: '#38bdf8' }
    }));

    const options = {
      physics: { hierarchicalRepulsion: { nodeDistance: 140 } },
      layout: { hierarchical: { direction: 'LR', sortMethod: 'directed' } }
    };

    networkRef.current = new Network(
      visJsRef.current, 
      { nodes: formattedNodes, edges: formattedEdges }, 
      options
    );
  }, [lineageData]);

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);

    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: searchQuery, topK: 3 })
      });
      const data = await res.json();
      setSearchResults(data.matches || []);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  };

  const handleIngest = async (e) => {
    e.preventDefault();
    setIngesting(true);
    setIngestOutput('🤖 Scribe Agent analyzing schema and generating Qdrant embeddings...');

    const cols = columnsInput.split(',').map(c => c.trim()).filter(Boolean);

    try {
      const res = await fetch('/api/document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tableName, columns: cols })
      });
      const data = await res.json();
      setIngestOutput(JSON.stringify(data, null, 2));
      fetchLineage();
    } catch (err) {
      setIngestOutput(`Error: ${err.message}`);
    } finally {
      setIngesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100 font-sans">
      
      {/* Navbar */}
      <header className="border-b border-slate-800/80 bg-[#0d1322]/80 backdrop-blur sticky top-0 z-50 px-6 py-3.5 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-cyan-950/80 border border-cyan-800/50 text-cyan-400">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-bold tracking-tight text-white">MetaGraph-MCP</h1>
              <span className="text-[10px] uppercase font-mono tracking-wider bg-cyan-950 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800/60">
                v1.0.0
              </span>
            </div>
            <p className="text-xs text-slate-400">Autonomous Governance & Lineage Context Layer for AI Agents</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-xs font-medium px-3 py-1 rounded-full bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Qdrant Vector DB Active
          </span>
          <a 
            href="http://localhost:3000/docs" 
            target="_blank" 
            rel="noreferrer"
            className="flex items-center gap-1.5 text-xs bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 px-3 py-1.5 rounded-lg border border-slate-700/80 transition"
          >
            Swagger Docs <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6 max-w-[1600px] mx-auto space-y-6">

        {/* Top Grid: Lineage DAG + Vector Search */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Lineage Graph Card */}
          <div className="lg:col-span-2 bg-[#0d1322] border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-cyan-400" />
                  Active SQL Lineage Graph (DAG)
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">Parsed column & table dependencies from SQL query ASTs</p>
              </div>
              <button 
                onClick={fetchLineage}
                className="flex items-center gap-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-cyan-400 text-xs px-3 py-1.5 rounded-lg border border-slate-700/80 transition cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh Graph
              </button>
            </div>

            <div 
              ref={visJsRef} 
              className="h-[380px] w-full bg-[#070a12] border border-slate-800/80 rounded-lg" 
            />
          </div>

          {/* Semantic Search Card */}
          <div className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-5 shadow-xl flex flex-col">
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2 mb-1">
              <Search className="w-4 h-4 text-cyan-400" />
              Semantic Context Search (RAG)
            </h2>
            <p className="text-xs text-slate-400 mb-4">Query catalog embeddings via Gemini over Qdrant</p>

            <form onSubmit={handleSearch} className="flex gap-2 mb-4">
              <input 
                type="text" 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. payment transactions with PII"
                className="flex-1 bg-[#070a12] border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500/80"
              />
              <button 
                type="submit" 
                disabled={searching}
                className="bg-cyan-600 hover:bg-cyan-500 text-white text-xs px-4 py-2.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-50"
              >
                {searching ? '...' : 'Search'}
              </button>
            </form>

            <div className="flex-1 overflow-y-auto space-y-3 max-h-[300px] pr-1">
              {searchResults.length === 0 ? (
                <div className="text-xs text-slate-500 italic p-4 text-center border border-dashed border-slate-800/80 rounded-lg">
                  Enter a prompt to test vector context retrieval...
                </div>
              ) : (
                searchResults.map((m, idx) => (
                  <div key={idx} className="bg-[#070a12] border border-slate-800/80 p-3.5 rounded-lg space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono text-xs font-bold text-cyan-300">{m.tableName}</span>
                      <span className="text-[10px] font-mono bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-800/60">
                        Score: {m.similarity_score}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">{m.business_description}</p>
                  </div>
                ))
              )}
            </div>
          </div>

        </div>

        {/* Bottom Panel: Ingestion Agent Tester */}
        <div className="bg-[#0d1322] border border-slate-800/80 rounded-xl p-5 shadow-xl space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
              <Bot className="w-4 h-4 text-emerald-400" />
              Scribe Agent Ingestion & PII Classifier
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">Auto-document table schemas, calculate confidence ratings, and tag PII</p>
          </div>

          <form onSubmit={handleIngest} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Table Name</label>
              <input 
                type="text" 
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500/80 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1.5 font-medium">Columns (Comma Separated)</label>
              <input 
                type="text" 
                value={columnsInput}
                onChange={(e) => setColumnsInput(e.target.value)}
                className="w-full bg-[#070a12] border border-slate-800 text-xs text-slate-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-cyan-500/80 font-mono"
              />
            </div>
            <div className="flex items-end">
              <button 
                type="submit" 
                disabled={ingesting}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white text-xs px-4 py-2.5 rounded-lg font-medium transition cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Activity className="w-4 h-4" />
                {ingesting ? 'Running Agent...' : 'Trigger Scribe Agent'}
              </button>
            </div>
          </form>

          {/* Output Payload JSON */}
          <div className="space-y-1.5">
            <span className="text-[11px] font-mono text-slate-400 uppercase tracking-wider">Agent Response Payload</span>
            <pre className="bg-[#070a12] p-4 rounded-lg border border-slate-800 text-xs text-cyan-300 font-mono overflow-x-auto max-h-56">
              {ingestOutput || '// Trigger Scribe Agent to inspect output JSON payload...'}
            </pre>
          </div>
        </div>

      </main>
    </div>
  );
}