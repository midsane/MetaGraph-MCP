import {
  AlertTriangle,
  CheckCircle2,
  Layers,
  Play,
  Table2,
  Zap,
} from 'lucide-react';
import { Pill } from '../components/Pill.tsx';
import { StatCard } from '../components/StatCard.tsx';

export function IngestSection({ catalog, ingestLogs, isLoading, isProcessing, onIngest, onSqlChange, riskHits, sqlInput, statementCount }) {
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Lines of SQL" value={sqlInput.split('\n').length} icon={Layers} accent="amber" />
        <StatCard label="Statements queued" value={statementCount} icon={Play} accent="amber" />
        <StatCard label="Tables in catalog" value={isLoading ? '…' : catalog.length} icon={Table2} accent="amber" hero />
        <StatCard label="Potential PII names" value={riskHits.length} icon={AlertTriangle} accent="rose" />
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="min-h-[430px] overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface)] lg:col-span-2">
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <span className="mg-mono text-xs text-[var(--text-dim)]">migration.sql</span>
            <span className="text-xs text-[var(--text-faint)]">Paste CREATE TABLE statements</span>
          </div>
          <textarea
            value={sqlInput}
            onChange={event => onSqlChange(event.target.value)}
            spellCheck={false}
            className="mg-mono mg-scroll h-[370px] w-full resize-none bg-transparent p-4 text-sm leading-6 text-[#E8B368] outline-none"
            aria-label="SQL to ingest"
          />
        </div>

        <div className="space-y-5">
          <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5" style={{ background: 'linear-gradient(150deg, var(--amber-soft), transparent 70%), var(--surface)' }}>
            <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.05]" />
            <div className="relative">
              <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--amber-soft)]"><Zap size={17} className="text-[var(--amber)]" /></span>
              <h2 className="mg-display mt-3 font-semibold">Run the pipeline</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--text-dim)]">Extract schemas, build lineage, document metadata, and persist embeddings.</p>
              <button
                onClick={onIngest}
                disabled={isProcessing}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--amber)] px-4 py-2.5 text-sm font-semibold text-[#171100] transition hover:brightness-110 disabled:opacity-60"
              >
                <Play size={15} fill="currentColor" />{isProcessing ? 'Running…' : 'Run pipeline'}
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

      {ingestLogs && (
        <pre className="mg-mono overflow-x-auto rounded-xl border border-white/10 bg-[var(--surface-2)] p-4 text-sm text-[var(--teal)]">{ingestLogs}</pre>
      )}
    </section>
  );
}
