import { Trash2 } from 'lucide-react';
import { ACCENTS, NAV } from '../constants.ts';

/** Top app bar: brand mark, catalog-purge button, and the tab navigation strip. */
export function AppHeader({ activeTab, isPurging, onPurge, onSelectTab }) {
  return (
    <header className="relative overflow-hidden border-b border-[var(--border)] bg-[var(--surface)]/85 backdrop-blur">
      <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--border)] bg-[var(--bg)]">
              <span className="h-2.5 w-2.5 rounded-full bg-[var(--teal)]" />
            </span>
            <div>
              <p className="mg-display text-[15px] font-semibold leading-none tracking-tight">MetaGraph</p>
              <p className="mt-1 text-[11px] text-[var(--text-faint)]">Active metadata &amp; lineage engine</p>
            </div>
          </div>

          <button
            onClick={onPurge}
            disabled={isPurging}
            className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg)] px-3 py-1.5 text-xs font-medium text-[var(--text-dim)] transition hover:border-[var(--rose)]/40 hover:text-[var(--rose)] disabled:opacity-50"
          >
            <Trash2 size={13} />{isPurging ? 'Purging…' : 'Purge catalog'}
          </button>
        </div>

        <nav className="flex gap-1.5 pt-1 pl-1 overflow-x-auto pb-3">
          {NAV.map(tab => {
            const accent = ACCENTS[tab.accent];
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition ${
                  isActive ? `${accent.bg} ${accent.text} ring-1 ${accent.ring}` : 'text-[var(--text-dim)] hover:bg-[var(--surface-2)] hover:text-[var(--text)]'
                }`}
              >
                <tab.icon size={16} />{tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
