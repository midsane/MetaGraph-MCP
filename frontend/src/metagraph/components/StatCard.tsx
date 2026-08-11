import { ACCENTS } from '../constants.ts';

export function StatCard({ label, value, icon: Icon, accent = 'amber', hero = false }) {
  const a = ACCENTS[accent] || ACCENTS.amber;

  if (hero) {
    return (
      <div
        className="relative overflow-hidden rounded-2xl border border-white/10 p-5"
        style={{ background: `linear-gradient(135deg, ${a.solid}26, transparent 65%), var(--surface)` }}
      >
        <div className="mg-graph-texture pointer-events-none absolute inset-0 opacity-[0.06]" />
        <div className="relative flex items-start justify-between">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-dim)]">{label}</p>
          {Icon && <Icon size={16} className={a.text} />}
        </div>
        <p className="mg-display relative mt-3 text-4xl font-semibold tracking-tight">{value}</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-[var(--surface)] p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-dim)]">{label}</p>
        {Icon && <span className={`grid h-7 w-7 place-items-center rounded-lg ${a.bg}`}><Icon size={14} className={a.text} /></span>}
      </div>
      <p className="mg-display mt-3 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
