export function Pill({ children, tone = 'neutral' }) {
  const styles = {
    neutral: 'bg-white/5 text-[var(--text-dim)] border border-white/5',
    good: 'bg-[var(--teal-soft)] text-[var(--teal)]',
    warn: 'bg-[var(--amber-soft)] text-[var(--amber)]',
    danger: 'bg-[var(--rose-soft)] text-[var(--rose)]',
    brand: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  };

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide ${styles[tone]}`}>{children}</span>;
}