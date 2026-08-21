/** Small rounded badge for status/tags, colored by its `tone` (neutral/good/warn/danger/brand). */
export function Pill({ children, tone = 'neutral', ...rest }) {
  const styles = {
    neutral: 'bg-[var(--surface-2)] text-[var(--text-dim)] border border-[var(--border)]',
    good: 'bg-[var(--teal-soft)] text-[var(--teal)]',
    warn: 'bg-[var(--amber-soft)] text-[var(--amber)]',
    danger: 'bg-[var(--rose-soft)] text-[var(--rose)]',
    brand: 'bg-[var(--violet-soft)] text-[var(--violet)]',
  };

  return <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-medium tracking-wide ${styles[tone]}`} {...rest}>{children}</span>;
}