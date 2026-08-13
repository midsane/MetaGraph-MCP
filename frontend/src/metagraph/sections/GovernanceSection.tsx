import { Lock, ShieldAlert, Layers, Table2 } from 'lucide-react';
import { Pill } from '../components/Pill.tsx';
import { StatCard } from '../components/StatCard.tsx';

export function GovernanceSection({ catalog, governedSchema, isLoading, piiCount, selectedTable, setSelectedTable, setUserRole, userRole }) {
  console.log("governed schema:", governedSchema)
  return (
    <section className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Catalog tables" value={catalog.length} icon={Table2} accent="amber" />
        <StatCard label="Columns in view" value={governedSchema?.columns?.length || 0} icon={Layers} accent="amber" />
        <StatCard label="PII fields" value={piiCount} icon={ShieldAlert} accent="rose" hero />
      </div>

      <div className="overflow-hidden rounded-2xl border border-white/10 bg-[var(--surface)]">
        <div className="flex flex-col gap-4 border-b border-white/10 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="mg-display flex items-center gap-2 font-semibold"><ShieldAlert size={17} className="text-[var(--amber)]" />Governed schema</h2>
            <p className="mt-1 text-sm text-[var(--text-dim)]">The server enforces PII redaction for Analyst access.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={selectedTable}
              onChange={event => setSelectedTable(event.target.value)}
              disabled={!catalog.length}
              className="mg-mono max-w-[200px] rounded-lg border border-white/10 bg-[var(--bg)] px-3 py-2 text-sm text-[var(--text)] disabled:opacity-50"
            >
              {catalog.length ? catalog.map(table => <option key={table.tableName} value={table.tableName}>{table.tableName}</option>) : <option>No tables</option>}
            </select>
            <div className="flex rounded-lg border border-white/10 bg-[var(--bg)] p-1">
              <button onClick={() => setUserRole('ADMIN')} className={`rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ADMIN' ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : 'text-[var(--text-dim)]'}`}>Admin</button>
              <button onClick={() => setUserRole('ANALYST')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ANALYST' ? 'bg-[var(--rose-soft)] text-[var(--rose)]' : 'text-[var(--text-dim)]'}`}><Lock size={12} />Analyst</button>
            </div>
          </div>
        </div>

        {governedSchema ? (
          <>
            <div className="border-b border-white/10 bg-black/15 p-4 sm:p-5">
              <h3 className="mg-mono text-base font-semibold text-[var(--teal)]">{governedSchema.tableName}</h3>
              <p className="mt-1 text-sm leading-6 text-[var(--text-dim)]">{governedSchema.business_description || 'No description available.'}</p>
            </div>
            <div className="mg-scroll overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-[var(--text-faint)]">
                  <tr><th className="px-5 py-3">Column</th><th className="px-5 py-3">Description</th><th className="px-5 py-3">Policy</th></tr>
                </thead>
                <tbody>
                  {governedSchema.columns.map((column, index) => (
                    <tr key={`${column.name}-${index}`} className="border-b border-white/10 last:border-0">
                      <td className={`mg-mono px-5 py-3 ${column.redacted ? 'text-[var(--rose)]' : 'text-[var(--teal)]'}`}>{column.name}</td>
                      <td className="px-5 py-3 text-[var(--text-dim)]">{column.description || 'No description available.'}</td>
                      <td className="px-5 py-3">{column.is_pii ? <Pill tone={column.redacted ? 'danger' : 'warn'}>{column.redacted ? 'Restricted' : 'PII'}</Pill> : <Pill>Standard</Pill>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div className="p-12 text-center text-sm text-[var(--text-faint)]">{isLoading ? 'Loading catalog…' : 'Apply SQL or sync in the Sync Demo tab to view governed schemas.'}</div>
        )}
      </div>
    </section>
  );
}
