import { Lock, Search, Sparkles } from 'lucide-react';
import { Pill } from '../components/Pill.tsx';

function renderAnswer(answer) {
  return answer
    ?.split('\n')
    .map((line, index) => {
      const trimmed = line.trim();

      if (!trimmed) {
        return <div key={index} className="h-2" />;
      }

      if (trimmed === '---') {
        return <hr key={index} className="border-[var(--border)]" />;
      }

      if (trimmed.startsWith('### ')) {
        return (
          <h3 key={index} className="mt-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--violet)]">
            {trimmed.replace(/^###\s+/, '').replace(/\*\*/g, '')}
          </h3>
        );
      }

      if (trimmed.startsWith('## ')) {
        return (
          <h4 key={index} className="mt-4 text-sm font-semibold text-[var(--text)]">
            {trimmed.replace(/^##\s+/, '').replace(/\*\*/g, '')}
          </h4>
        );
      }

      if (trimmed.startsWith('* ')) {
        return (
          <li key={index} className="ml-5 list-disc text-sm leading-6 text-[var(--text-dim)]">
            {trimmed.replace(/^\*\s+/, '').replace(/\*\*/g, '')}
          </li>
        );
      }

      return (
        <p key={index} className="text-sm leading-6 text-[var(--text-dim)]">
          {trimmed.replace(/\*\*/g, '')}
        </p>
      );
    });
}

export function AskSection({ isSearching, onQueryChange, onSearch, ragQuery, ragResult, setUserRole, suggestions, userRole }) {
  const matchedTables = ragResult?.matchedTables || [];

  return (
    <section className="space-y-5">
      <div className="relative overflow-hidden rounded-2xl border border-[var(--border)] p-5 sm:p-8" style={{ background: 'linear-gradient(150deg, var(--violet-soft), transparent 65%), var(--surface)' }}>
        <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.06]" />
        <div className="relative">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--violet-soft)]"><Sparkles size={19} className="text-[var(--violet)]" /></span>
          <h2 className="mg-display mt-4 text-xl font-semibold">Ask a question</h2>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--text-dim)]">Search the live Qdrant metadata catalog using natural language.</p>
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--text-dim)]">Choose the role to apply to this catalog query.</p>
            <div className="flex rounded-lg border border-[var(--border)] bg-[var(--bg)] p-1">
              <button type="button" onClick={() => setUserRole('ADMIN')} className={`rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ADMIN' ? 'bg-[var(--amber-soft)] text-[var(--amber)]' : 'text-[var(--text-dim)]'}`}>Admin</button>
              <button type="button" onClick={() => setUserRole('ANALYST')} className={`flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium transition ${userRole === 'ANALYST' ? 'bg-[var(--rose-soft)] text-[var(--rose)]' : 'text-[var(--text-dim)]'}`}><Lock size={12} />Analyst</button>
            </div>
          </div>
          <form onSubmit={onSearch} className="mt-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-faint)]" />
              <input
                value={ragQuery}
                onChange={event => onQueryChange(event.target.value)}
                placeholder="e.g. Which table contains customer contact details?"
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] py-3 pl-10 pr-4 text-sm text-[var(--text)] outline-none focus:border-[var(--violet)]/50"
              />
            </div>
            <button disabled={isSearching} className="rounded-xl bg-[var(--violet)] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60">
              {isSearching ? 'Searching…' : 'Search'}
            </button>
          </form>
          <div className="mt-4 flex flex-wrap gap-2">
            {suggestions.map(suggestion => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  onQueryChange(suggestion);
                  onSearch(null, suggestion);
                }}
                className="rounded-full border border-[var(--border)] bg-[var(--surface-2)] px-3 py-1.5 text-xs text-[var(--text-dim)] transition hover:bg-[var(--hover-strong)] hover:text-[var(--text)]"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>

      {ragResult ? (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,0.75fr)]">
          <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Query</p>
                <h3 className="mt-1 mg-display text-lg font-semibold text-[var(--text)]">{ragResult.query}</h3>
              </div>
              <Pill tone="good">{matchedTables.length} matched table{matchedTables.length === 1 ? '' : 's'}</Pill>
            </div>

            <div className="mt-5 space-y-3">
              {renderAnswer(ragResult.answer)}
            </div>
          </article>

          <aside className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
            <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-faint)]">Matched tables</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {matchedTables.length ? matchedTables.map(tableName => (
                <Pill key={tableName} tone="brand">{tableName}</Pill>
              )) : (
                <span className="text-sm text-[var(--text-faint)]">No tables matched.</span>
              )}
            </div>
          </aside>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-[var(--border-strong)] p-12 text-center text-sm text-[var(--text-faint)]">
          Search results from the live catalog will appear here.
        </div>
      )}
    </section>
  );
}
