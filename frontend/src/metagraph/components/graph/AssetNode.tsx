import { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { CalendarDays, CheckCircle2, ChevronDown, ChevronUp, Database, Hash, ShieldAlert, Type } from 'lucide-react';
import { NODE_WIDTH, VISIBLE_COLUMNS } from './asset-node-layout.ts';

/** Picks a representative icon for a column based on its SQL data type. */
function iconForType(dataType) {
  const t = (dataType || '').toLowerCase();
  if (t.includes('time') || t.includes('date')) return CalendarDays;
  if (t.includes('int') || t.includes('numeric') || t.includes('decimal') || t.includes('serial') || t.includes('uuid')) return Hash;
  return Type;
}

/** Custom React Flow node: a table card with an expandable, PII-flagged column list, or a "pending sync" placeholder for undocumented tables. */
export function AssetNode({ data, selected }) {
  const [expanded, setExpanded] = useState(true);
  const [showAll, setShowAll] = useState(false);

  const borderClass = !data.documented
    ? 'border-dashed border-[var(--violet)]'
    : selected
      ? 'border-[var(--blue)]'
      : data.piiCount > 0
        ? 'border-[var(--rose)]'
        : 'border-[var(--border-strong)]';

  const columns = data.columns || [];
  const visibleColumns = showAll ? columns : columns.slice(0, VISIBLE_COLUMNS);

  return (
    <div
      style={{ width: NODE_WIDTH }}
      className={`overflow-hidden rounded-2xl border-2 bg-[var(--surface)] shadow-[0_6px_20px_rgba(0,0,0,0.45)] transition-colors ${borderClass}`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-[var(--surface)] !bg-[var(--text-faint)]" />
      <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-[var(--surface)] !bg-[var(--text-faint)]" />

      <div className="p-4">
        <div className="flex items-center gap-1.5">
          <span className="mg-mono truncate text-[15px] font-semibold text-[var(--blue)]">{data.label}</span>
          {data.documented && <CheckCircle2 size={15} className="shrink-0 text-[var(--teal)]" />}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[var(--text-faint)]">
          <Database size={12} />
          <span>Table in target_db</span>
        </div>
      </div>

      {data.documented ? (
        <>
          <button
            onClick={event => { event.stopPropagation(); setExpanded(v => !v); }}
            className="nodrag flex w-full items-center justify-between border-t border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-dim)] transition hover:bg-[var(--hover)]"
          >
            <span>{columns.length} column{columns.length === 1 ? '' : 's'}</span>
            {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
          </button>

          {expanded && (
            <div className="border-t border-[var(--border)]">
              {visibleColumns.map(column => {
                const Icon = iconForType(column.dataType);
                return (
                  <div key={column.columnName} className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-2 last:border-0">
                    <span className="flex min-w-0 items-center gap-2">
                      <Icon size={13} className="shrink-0 text-[var(--text-faint)]" />
                      <span className="mg-mono truncate text-sm text-[var(--text)]">{column.columnName}</span>
                    </span>
                    {column.isPii && (
                      <span title={column.piiReason || undefined} className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--rose-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--rose)]">
                        <ShieldAlert size={10} />PII
                      </span>
                    )}
                  </div>
                );
              })}
              {columns.length > VISIBLE_COLUMNS && (
                <button
                  onClick={event => { event.stopPropagation(); setShowAll(v => !v); }}
                  className="nodrag w-full py-2.5 text-center text-sm font-medium text-[var(--blue)] transition hover:bg-[var(--hover)]"
                >
                  {showAll ? 'Show fewer columns' : 'Show more columns'}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <div className="border-t border-dashed border-[var(--violet)]/40 px-4 py-3 text-xs text-[var(--text-faint)]">
          Pending sync — not yet documented
        </div>
      )}
    </div>
  );
}
