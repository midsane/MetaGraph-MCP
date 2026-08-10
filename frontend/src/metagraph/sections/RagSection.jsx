import { Search, Sparkles } from 'lucide-react';
import { Pill } from '../components/Pill.jsx';

export function RagSection({ isSearching, onQueryChange, onSearch, ragQuery, ragResults, suggestions }) {
  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-white/10 p-5 sm:p-8" style={{ background: 'linear-gradient(150deg, var(--violet-soft), transparent 65%), var(--surface)' }}>
        <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.06]" />
        <div className="relative">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--violet-soft)]"><Sparkles size={19} className="text-[var(--violet)]" /></span>
          <h2 className="mg-display mt-4 text-xl font-semibold">Ask the catalog</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">Search the live Qdrant metadata catalog using natural language.</p>
          <form onSubmit={onSearch} className="mt-5 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={ragQuery}
                onChange={event => onQueryChange(event.target.value)}
                placeholder="e.g. Which table contains customer contact details?"
                className="w-full rounded-xl border border-white/10 bg-[var(--bg)] py-3 pl-10 pr-4 text-sm text-[var(--text)] outline-none focus:border-[var(--violet)]/50"
              />
            </div>
            <button disabled={isSearching} className="rounded-xl bg-[var(--violet)] px-5 py-3 text-sm font-semibold text-[#100B24] transition hover:brightness-110 disabled:opacity-60">
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map(suggestion => (
              <button key={suggestion} type="button" onClick={() => onSearch(null, suggestion)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-white/10 hover:text-[var(--text)]">
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {ragResults.length ? ragResults.map(result => (
          <article key={result.tableName} className="rounded-2xl border border-white/10 bg-[var(--surface)] p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="mg-mono font-semibold text-[var(--teal)]">{result.tableName}</h3>
                <p className="mt-2 text-sm leading-6 text-[var(--text-dim)]">{result.business_description || 'No description available.'}</p>
              </div>
              <Pill tone="good">{Math.round((result.similarity_score || 0) * 100)}%</Pill>
            </div>
            <p className="mt-4 border-t border-white/10 pt-3 text-xs text-[var(--text-faint)]">{result.columns?.length || 0} documented columns</p>
          </article>
        )) : (
          <div className="rounded-2xl border border-dashed border-white/15 p-12 text-center text-sm text-[var(--text-faint)] md:col-span-2">
            Search results from the live catalog will appear here.
          </div>
        )}
      </div>
    </section>
  );
}