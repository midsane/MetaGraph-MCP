import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Play,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { Pill } from '../components/Pill.tsx';
import { StatCard } from '../components/StatCard.tsx';

function BusinessTableChip({ table }) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <span className="mg-mono text-sm text-[var(--text)]">{table.tableName}</span>
        <Pill>{table.columns.length} col{table.columns.length === 1 ? '' : 's'}</Pill>
      </div>
    </div>
  );
}

export function BusinessDbSection({
  actionLog,
  businessDbTables,
  isLoading,
  isProcessing,
  isSyncing,
  onExec,
  onSqlChange,
  onSyncNow,
  riskHits,
  sqlInput,
  statementCount,
}) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Business-db tables" value={isLoading ? '…' : businessDbTables.length} icon={Database} accent="amber" hero />
        <StatCard label="Statements queued" value={statementCount} icon={Play} accent="amber" />
        <StatCard label="Potential PII names" value={riskHits.length} icon={AlertTriangle} accent="rose" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-h-[280px] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
            <span className="mg-mono text-xs text-[var(--text-dim)]">migration.sql</span>
            <span className="text-xs text-[var(--text-faint)]">Schema-qualify with target_db.</span>
          </div>
          <textarea
            value={sqlInput}
            onChange={event => onSqlChange(event.target.value)}
            spellCheck={false}
            className="mg-mono mg-scroll h-[260px] w-full resize-none bg-transparent p-4 text-sm leading-6 text-[#E8B368] outline-none"
            aria-label="SQL to apply to business-db"
          />
        </div>

        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5" style={{ background: 'linear-gradient(150deg, var(--amber-soft), transparent 70%), var(--surface)' }}>
            <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.05]" />
            <div className="relative space-y-3">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--amber-soft)]"><Zap size={17} className="text-[var(--amber)]" /></span>
              <div>
                <h2 className="mg-display font-semibold">Apply to business-db</h2>
                <p className="mt-1 text-sm leading-6 text-[var(--text-dim)]">Runs and logs the statement, then either wait for the event-driven sync or force it now.</p>
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
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] px-4 py-2.5 text-sm font-semibold text-[var(--text)] transition hover:bg-[var(--hover-strong)] disabled:opacity-60"
              >
                <RefreshCw size={15} className={isSyncing ? 'animate-spin' : ''} />{isSyncing ? 'Syncing…' : 'Sync now'}
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
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
        <pre className="mg-mono overflow-x-auto whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-4 text-sm text-[var(--teal)]">{actionLog}</pre>
      )}

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="mg-display font-semibold">Live on business-db</h2>
          <span className="flex items-center gap-1.5 text-xs text-[var(--text-faint)]"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--teal)]" />refreshing every few seconds</span>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {businessDbTables.length ? businessDbTables.map(table => (
            <BusinessTableChip key={table.tableName} table={table} />
          )) : (
            <p className="text-sm text-[var(--text-faint)]">{isLoading ? 'Loading…' : 'No tables on business-db yet.'}</p>
          )}
        </div>
      </div>
    </section>
  );
}
