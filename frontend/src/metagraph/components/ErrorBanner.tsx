/** Dismissible red banner showing the current error message, if any. */
export function ErrorBanner({ error, onDismiss }) {
  if (!error) {
    return null;
  }

  return (
    <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-[var(--rose)]/25 bg-[var(--rose-soft)] px-4 py-3 text-sm text-[var(--rose)]">
      <span>{error}</span>
      <button onClick={onDismiss} aria-label="Dismiss error" className="text-[var(--rose)]/70 hover:text-[var(--rose)]">×</button>
    </div>
  );
}