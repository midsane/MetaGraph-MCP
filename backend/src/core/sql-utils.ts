/** Strips single-line (--) and block (slash-star) SQL comments. */
export function stripSqlComments(sql: string): string {
  return sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}
