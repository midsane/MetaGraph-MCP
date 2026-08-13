import { GitBranch, RefreshCw, ShieldAlert, Table2 } from 'lucide-react';
import { StatCard } from '../components/StatCard.tsx';
import { LineageGraph } from '../components/LineageGraph.tsx';
import { AssetDetailPanel } from '../components/AssetDetailPanel.tsx';

export function ContextLayerSection({
  catalogDbTables,
  downstream,
  graphData,
  isLoading,
  onSelectAsset,
  piiColumnCount,
  selectedAsset,
  selectedAssetName,
  syncWatermark,
  upstream,
}) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tables documented" value={isLoading ? '…' : catalogDbTables.length} icon={Table2} accent="teal" hero />
        <StatCard label="PII columns" value={piiColumnCount} icon={ShieldAlert} accent="rose" />
        <StatCard label="Lineage edges" value={graphData.edges.length} icon={GitBranch} accent="violet" />
        <StatCard label="Sync watermark" value={syncWatermark} icon={RefreshCw} accent="amber" />
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-2 sm:p-3">
          {graphData.nodes.length ? (
            <LineageGraph nodes={graphData.nodes} edges={graphData.edges} selectedId={selectedAssetName} onSelect={onSelectAsset} />
          ) : (
            <div className="flex h-[640px] items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] text-sm text-[var(--text-faint)]">
              {isLoading ? 'Loading context layer…' : 'No tables yet — apply SQL or sync from Update Business DB.'}
            </div>
          )}
        </div>

        <div className="h-[640px]">
          <AssetDetailPanel
            tableName={selectedAssetName}
            table={selectedAsset}
            upstream={upstream}
            downstream={downstream}
            onClose={() => onSelectAsset(null)}
          />
        </div>
      </div>
    </section>
  );
}
