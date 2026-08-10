import { GitBranch, Layers, RefreshCw, Table2 } from 'lucide-react';
import { LineageGraph } from '../components/LineageGraph.jsx';
import { StatCard } from '../components/StatCard.jsx';

export function LineageSection({ catalog, graphData, isLoading, onRefresh }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Catalog tables" value={catalog.length} icon={Table2} accent="teal" />
        <StatCard label="Graph nodes" value={graphData.nodes.length} icon={GitBranch} accent="teal" hero />
        <StatCard label="Lineage relationships" value={graphData.edges.length} icon={Layers} accent="teal" />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="mg-display font-semibold">Active SQL lineage</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">Arrows point from source tables to the tables that depend on them.</p>
          </div>
          <button onClick={onRefresh} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-[var(--text-dim)] transition hover:bg-white/5 hover:text-[var(--text)]">
            <RefreshCw size={14} />Refresh
          </button>
        </div>

        {graphData.nodes.length ? (
          <LineageGraph nodes={graphData.nodes} edges={graphData.edges} />
        ) : (
          <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-[var(--text-faint)]">
            {isLoading ? 'Loading lineage…' : 'Ingest SQL to populate the catalog and lineage graph.'}
          </div>
        )}
      </div>
    </section>
  );
}