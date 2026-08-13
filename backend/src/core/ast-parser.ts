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

      // A table cannot depend on itself in our DAG
      if (target) {
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