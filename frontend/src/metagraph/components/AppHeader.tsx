import { Trash2 } from 'lucide-react';
import { ACCENTS, NAV } from '../constants.ts';

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

          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-dim)] sm:flex">
              <span className="mg-live-dot h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
              Live
            </span>
            <button
              onClick={onPurge}
              disabled={isPurging}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rose)]/25 px-3 py-2 text-xs font-medium text-[var(--rose)] transition hover:bg-[var(--rose-soft)] disabled:opacity-50"
            >
              <Trash2 size={14} />{isPurging ? 'Purging' : 'Purge'}
            </button>
          </div>
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
