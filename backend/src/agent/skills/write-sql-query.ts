import type { Skill } from './types.js';

const SQL_INTENT_RE =
  /\b(write|generate|draft|create|build|construct|update|fix)\b[\s\S]{0,40}\b(sql|query|queries|statement)\b|\bsql\s+(query|statement|migration)\b/i;

export const writeSqlQuerySkill: Skill = {
  id: 'write-sql-query',
  name: 'Write SQL Query',
  matches: (query: string) => SQL_INTENT_RE.test(query),
  directive: `
SKILL: WRITE SQL QUERY (loaded because this request looks like it wants a SQL query/statement)
Follow this procedure before producing any SQL:
1. Identify every table the query will read from or write to.
2. For EACH such table, call check_downstream_impact(tableName) before writing SQL - this is
   mandatory, not optional, even for a simple SELECT. Report the impacted count in your final answer.
3. Call get_governed_schema(tableName) for each table to get the RBAC-safe column list for the
   caller's actual role. NEVER reference a column whose name comes back as "[REDACTED_PII_*]" in
   SQL you write - that column does not exist for the current caller and referencing it is a
   governance violation, not just bad SQL.
4. Only after steps 1-3 are complete for every referenced table, write the SQL inside a fenced
   \`\`\`sql code block.
5. Immediately after the SQL, add a short "Impact notes" section summarizing the
   downstream_impacted_tables found in step 2, or state that none were found.
Skipping the downstream-impact check before emitting SQL is not allowed under any circumstance.
`.trim(),
};
