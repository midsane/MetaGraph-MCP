// node-sql-parser ships a webpack/UMD CJS bundle whose named exports are not
// statically analyzable by Node's ESM loader, so we take the default import
// (the whole CJS `module.exports` object) and destructure at runtime.
import pkg from 'node-sql-parser';
import { stripSqlComments } from './sql-utils.js';
const { Parser } = pkg;

export interface LineageDependency {
  target: string;
  sources: string[];
}

export class ASTParser {
  private parser: InstanceType<typeof Parser>;

  /** Creates the underlying node-sql-parser instance used by this parser. */
  constructor() {
    this.parser = new Parser();
  }

  /**
   * Strips schema prefixes (e.g., 'target_db.users' -> 'users')
   */
  private extractTableName(rawName: string): string {
    const parts = rawName.split('.');
    return parts[parts.length - 1].trim();
  }

  /**
   * tableList() only tracks data-flow tables (FROM/JOIN/INSERT-SELECT/CTAS) -
   * it silently drops FOREIGN KEY REFERENCES on CREATE TABLE, even though
   * those referenced tables are real upstream dependencies for lineage
   * purposes. Walk the full AST's create_definitions to recover them, for
   * both the inline (`col TYPE REFERENCES t(c)`) and standalone
   * (`FOREIGN KEY (col) REFERENCES t(c)`) constraint forms.
   */
  private extractForeignKeyReferences(sql: string): string[] {
    const refs = new Set<string>();
    try {
      const ast = this.parser.astify(sql, { database: 'Postgresql' });
      const statements = Array.isArray(ast) ? ast : [ast];
      for (const stmt of statements) {
        if (stmt?.type !== 'create' || stmt?.keyword !== 'table') continue;
        for (const def of stmt.create_definitions || []) {
          // node-sql-parser's types omit reference_definition from this
          // union member even though it's present at runtime for both FK
          // constraint forms.
          const refTable = (def as any)?.reference_definition?.table?.[0]?.table;
          if (refTable) refs.add(this.extractTableName(refTable));
        }
      }
    } catch {
      // astify failures are already surfaced by tableList() below; ignore here.
    }
    return Array.from(refs);
  }

  /**
   * Analyzes a raw SQL string and extracts the target table and all upstream sources.
   */
  extractDependencies(sql: string): LineageDependency {
    try {
      const clean = stripSqlComments(sql).trim();
      if (!clean) return { target: '', sources: [] };

      // tableList returns an array of strings like: "select::null::users"
      const tableList = this.parser.tableList(clean, { database: 'Postgresql' });

      let target = '';
      const sources = new Set<string>();

      for (const entry of tableList) {
        if (!entry) continue;
        const parts = entry.split('::');
        const action = parts[0]?.toLowerCase();
        const rawTableName = parts[2];

        if (!rawTableName || rawTableName === 'null') continue;

        const tableName = this.extractTableName(rawTableName);

        if (['insert', 'update', 'create', 'replace'].includes(action)) {
          target = tableName;
        } else if (action === 'select') {
          sources.add(tableName);
        }
      }

      if (target) {
        for (const ref of this.extractForeignKeyReferences(clean)) {
          sources.add(ref);
        }
        // A table cannot depend on itself in our DAG
        sources.delete(target);
      }

      return {
        target,
        sources: Array.from(sources)
      };
    } catch (err) {
      console.warn('[AST Parser] Failed to parse SQL (skipping lineage for this query):', sql.substring(0, 50));
      return { target: '', sources: [] };
    }
  }
}