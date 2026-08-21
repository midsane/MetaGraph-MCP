export type Role = 'ADMIN' | 'ANALYST';

/** Coerces any input into a valid Role, defaulting to the least-privileged ANALYST. */
export function normalizeRole(role: unknown): Role {
  return String(role).toUpperCase() === 'ADMIN' ? 'ADMIN' : 'ANALYST';
}

/** True if the given role (after normalization) is ADMIN. */
export function isAdmin(role: unknown): boolean {
  return normalizeRole(role) === 'ADMIN';
}

export interface RedactableColumn {
  name: string;
  description: string;
  is_pii: boolean;
}

/**
 * Single point every tool/route funnels PII redaction through. `role` must
 * come from the authenticated caller (server-injected), never from a
 * model- or client-supplied argument.
 */
export function redactColumns<T extends RedactableColumn>(columns: T[], role: unknown): T[] {
  if (isAdmin(role)) return columns;
  const callerRole = normalizeRole(role);
  return columns.map(col => {
    if (!col.is_pii) return col;
    return {
      ...col,
      name: `[REDACTED_PII_${col.name.toUpperCase()}]`,
      description: `ACCESS DENIED: Column masked due to ${callerRole} role policies.`,
    };
  });
}

/** Converts a raw catalog-db column row into the shape redactColumns() expects. */
export function mapStoredColumns(
  raw: Array<{ column_name: string; pii_reason: string | null; is_pii: boolean }>
): RedactableColumn[] {
  return raw.map(col => ({
    name: col.column_name,
    description: col.pii_reason || '',
    is_pii: col.is_pii,
  }));
}
