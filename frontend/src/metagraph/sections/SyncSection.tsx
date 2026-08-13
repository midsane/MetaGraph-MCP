import {
  AlertTriangle,
  CheckCircle2,
  Database,
  GitBranch,
  Play,
  RefreshCw,
  Table2,
  Zap,
} from 'lucide-react';
import { Pill } from '../components/Pill.tsx';
import { StatCard } from '../components/StatCard.tsx';
import { LineageGraph } from '../components/LineageGraph.tsx';

function BusinessColumnChip({ column }) {
  return (
    <span className="mg-mono inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[var(--text-dim)]">
      {column.columnName}
      <span className="text-[var(--text-faint)]">{column.dataType}</span>
    </span>
  );
}

function CatalogColumnChip({ column }) {
  if (column.isPii) {
    return (
      <span className="mg-mono inline-flex items-center gap-1 rounded-md border border-[var(--rose)]/30 bg-[var(--rose-soft)] px-2 py-1 text-[11px] text-[var(--rose)]">
        {column.columnName}
        <span className="text-[var(--rose)]/70">PII</span>
      </span>
    );
  }

  return (
    <span className="mg-mono inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] text-[var(--text-dim)]">
      {column.columnName}
    </span>
  );
}

function DbPanel({ title, subtitle, icon: Icon, accent, tables, isLoading, variant, emptyHint }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface)]">
      <div className="border-b border-white/10 p-4 sm:p-5">
        <h2 className={`mg-display flex items-center gap-2 font-semibold ${accent}`}><Icon size={17} />{title}</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">{subtitle}</p>
      </div>

      <div className="mg-scroll max-h-[420px] space-y-3 overflow-y-auto p-4 sm:p-5">
        {tables.length ? tables.map(table => (
          <div key={table.tableName} className="rounded-xl border border-white/10 bg-[var(--bg)] p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="mg-mono text-sm font-semibold text-[var(--text)]">{table.tableName}</span>
              <Pill>{table.columns.length} col{table.columns.length === 1 ? '' : 's'}</Pill>
            </div>
            {variant === 'catalog' && (
              <p className="mt-1.5 text-xs leading-5 text-[var(--text-dim)]">{table.businessSummary || 'No business description yet.'}</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {table.columns.map(column => (
                variant === 'catalog'
                  ? <CatalogColumnChip key={column.columnName} column={column} />
                  : <BusinessColumnChip key={column.columnName} column={column} />
              ))}
            </div>
          </div>
        )) : (
          <div className="flex h-[200px] items-center justify-center text-center text-sm text-[var(--text-faint)]">
            {isLoading ? 'Loading…' : emptyHint}
          </div>
        )}
      </div>
    </div>
  );
}

export function SyncSection({
  actionLog,
  businessDbTables,
  catalogDbTables,
  graphData,
  isLoading,
  isProcessing,
  isSyncing,
  onExec,
  onSqlChange,
  onSyncNow,
  riskHits,
  sqlInput,
  statementCount,
  syncWatermark,
}) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Business-db tables" value={isLoading ? '…' : businessDbTables.length} icon={Database} accent="amber" />
        <StatCard label="Catalog-db tables" value={isLoading ? '…' : catalogDbTables.length} icon={Table2} accent="teal" hero />
        <StatCard label="Sync watermark" value={syncWatermark} icon={RefreshCw} accent="violet" />
        <StatCard label="Lineage edges" value={graphData.edges.length} icon={GitBranch} accent="rose" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-h-[280px] overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface)] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="mg-mono text-xs text-[var(--text-dim)]">migration.sql</span>
            <span className="text-xs text-[var(--text-faint)]">SQL to apply to business-db</span>
          </div>
          <textarea
            value={sqlInput}
            onChange={event => onSqlChange(event.target.value)}
            spellCheck={false}
            className="mg-mono mg-scroll h-[220px] w-full resize-none bg-transparent p-4 text-sm leading-6 text-[#E8B368] outline-none"
            aria-label="SQL to apply to business-db"
          />
          <div className="border-t border-white/10 px-4 py-2 text-xs text-[var(--text-faint)]">{statementCount} statement{statementCount === 1 ? '' : 's'} queued</div>
        </div>

        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5" style={{ background: 'linear-gradient(150deg, var(--amber-soft), transparent 70%), var(--surface)' }}>
            <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.05]" />
            <div className="relative space-y-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--amber-soft)]"><Zap size={17} className="text-[var(--amber)]" /></span>
              <div>
                <h2 className="mg-display font-semibold">Business-db actions</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-dim)]">Apply SQL to business-db, then watch the panels below catch up on their own — or force it immediately with a manual sync.</p>
              </div>
              <button
                onClick={onExec}
                disabled={isProcessing}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--amber)] px-4 py-2.5 text-sm font-semibold text-[#171100] transition hover:brightness-110 disabled:opacity-60"
              >
                <Play size={15} fill="currentColor" />{isProcessing ? 'Applying…' : 'Apply SQL'}
              </button>
              <button
                onClick={onSyncNow}
                disabled={isSyncing}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-white/10 disabled:opacity-60"
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />{isSyncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">PII pre-scan</h2>
              <Pill tone={riskHits.length ? 'danger' : 'good'}>{riskHits.length ? `${riskHits.length} flagged` : 'clear'}</Pill>
            </div>
            <div className="mt-4 space-y-2">
              {riskHits.length ? riskHits.map(name => (
                <div key={name} className="mg-mono flex items-center gap-2 rounded-lg bg-[var(--rose-soft)] px-3 py-2 text-sm text-[var(--rose)]">
                  <AlertTriangle size={14} />{name}
                </div>
              )) : (
                <p className="flex items-center gap-2 text-sm text-[var(--text-dim)]"><CheckCircle2 size={15} className="text-[var(--teal)]" />No sensitive names detected</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {actionLog && (
        <pre className="mg-mono overflow-x-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-[var(--surface-2)] p-4 text-sm text-[var(--teal)]">{actionLog}</pre>
      )}

      <div className="flex items-center gap-2 text-xs text-[var(--text-faint)]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--teal)]" />
        Live — business-db and catalog-db panels refresh automatically every few seconds
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <DbPanel
          title="Business DB"
          subtitle="Live ground truth — information_schema, no PII tagging or descriptions."
          icon={Database}
          accent="text-[var(--amber)]"
          tables={businessDbTables}
          isLoading={isLoading}
          variant="business"
          emptyHint="No tables on business-db yet."
        />
        <DbPanel
          title="Catalog DB (context layer)"
          subtitle="What syncUp() has documented so far — business descriptions & PII verdicts."
          icon={Table2}
          accent="text-[var(--teal)]"
          tables={catalogDbTables}
          isLoading={isLoading}
          variant="catalog"
          emptyHint="Nothing synced yet — apply SQL or hit Sync now."
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-4">
          <h2 className="mg-display flex items-center gap-2 font-semibold text-[var(--violet)]"><GitBranch size={17} />Lineage DAG (Neo4j)</h2>
          <p className="mt-1 text-sm text-[var(--text-dim)]">Arrows point from source tables to the tables that depend on them.</p>
        </div>

        {graphData.nodes.length ? (
          <LineageGraph nodes={graphData.nodes} edges={graphData.edges} />
        ) : (
          <div className="flex h-[360px] items-center justify-center rounded-xl border border-dashed border-white/15 text-sm text-[var(--text-faint)]">
            {isLoading ? 'Loading lineage…' : 'No lineage yet — apply SQL or hit Sync now.'}
          </div>
        )}
      </div>
    </section>
  );
}
