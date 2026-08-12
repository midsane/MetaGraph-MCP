import { Parser } from 'node-sql-parser';

export interface LineageDependency {
  target: string;
  sources: string[];
}

export class ASTParser {
  private parser: Parser;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Cleans SQL of comments before passing to the strict AST parser
   */
  private cleanSql(sql: string): string {
    return sql
      .replace(/--.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim();
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
      const clean = this.cleanSql(sql);
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