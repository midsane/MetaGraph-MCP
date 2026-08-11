import { Trash2 } from 'lucide-react';

export function AppHeader({ activeNav, activeAccent, isPurging, onPurge }) {
  return (
    <header className="relative overflow-hidden border-b border-white/10 bg-[var(--surface)]/80 px-4 py-5 backdrop-blur sm:px-6 lg:px-10">
      <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.05]" />
      <div className="relative mx-auto flex max-w-7xl items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={`h-1.5 w-1.5 rounded-full ${activeAccent.text.replace('text-', 'bg-')}`} />
            <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-[var(--text-faint)]">MetaGraph</p>
          </div>
          <h1 className="mg-display mt-1 truncate text-2xl font-semibold tracking-tight">{activeNav?.label}</h1>
          <p className="mt-0.5 text-sm text-[var(--text-dim)]">Metadata catalog, lineage, and governed context</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--text-dim)] sm:flex">
            <span className="mg-live-dot h-1.5 w-1.5 rounded-full bg-[var(--teal)]" />
            catalog API
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
    </header>
  );
}