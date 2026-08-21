import { Database, ShieldAlert, X } from 'lucide-react';
import { Pill } from './Pill.tsx';

/** Side panel showing the selected lineage-graph node's business description, PII-tagged columns, and upstream/downstream neighbors. */
export function AssetDetailPanel({ tableName, table, upstream, downstream, onClose }) {
  if (!tableName) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-[var(--border-strong)] p-8 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--surface-2)]"><Database size={18} className="text-[var(--text-faint)]" /></span>
        <p className="text-sm text-[var(--text-dim)]">Select a node on the graph to inspect its business definition, columns, and PII policy.</p>
      </div>
    );
  }

  const piiCount = table ? table.columns.filter(column => column.isPii).length : 0;

  return (
    <div className="mg-scroll flex h-full flex-col overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-5">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Data asset</p>
          <h3 className="mg-mono mt-1 truncate text-lg font-semibold text-[var(--text)]">{tableName}</h3>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[var(--text-dim)] transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]">
          <X size={15} />
        </button>
      </div>

      {table ? (
        <>
          <div className="flex flex-wrap gap-2 border-b border-[var(--border)] p-5">
            <Pill>{table.columns.length} column{table.columns.length === 1 ? '' : 's'}</Pill>
            {piiCount ? <Pill tone="danger">{piiCount} PII</Pill> : <Pill tone="good">No PII</Pill>}
          </div>

          {(upstream.length > 0 || downstream.length > 0) && (
            <div className="space-y-4 border-b border-[var(--border)] p-5">
              {upstream.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Upstream sources</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {upstream.map(name => <Pill key={name} tone="brand">{name}</Pill>)}
                  </div>
                </div>
              )}
              {downstream.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Downstream dependents</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {downstream.map(name => <Pill key={name} tone="warn">{name}</Pill>)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="border-b border-[var(--border)] p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Business definition</p>
            <p className="mt-2 text-sm leading-6 text-[var(--text-dim)]">{table.businessSummary || 'No description available.'}</p>
          </div>

          <div className="p-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-faint)]">Columns</p>
            <div className="space-y-2">
              {table.columns.map(column => (
                <div key={column.columnName} className="flex items-start justify-between gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-2">
                  <div className="min-w-0">
                    <p className="mg-mono truncate text-sm text-[var(--text)]">{column.columnName}</p>
                    <p className="mg-mono text-[11px] text-[var(--text-faint)]">{column.dataType}</p>
                  </div>
                  {column.isPii ? (
                    <Pill tone="danger" title={column.piiReason || undefined}>PII</Pill>
                  ) : (
                    <Pill>Standard</Pill>
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--violet-soft)]"><ShieldAlert size={18} className="text-[var(--violet)]" /></span>
          <p className="text-sm text-[var(--text-dim)]">
            <span className="mg-mono text-[var(--text)]">{tableName}</span> appears in the lineage graph but hasn't been documented yet — likely picked up from a logged query (Track B) before syncUp() indexed its schema (Track A).
          </p>
          <p className="text-xs text-[var(--text-faint)]">Run "Sync now" from Update Business DB to pull its schema, PII tags, and description.</p>
        </div>
      )}
    </div>
  );
}
