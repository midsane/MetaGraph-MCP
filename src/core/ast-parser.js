import pkg from 'node-sql-parser';
const { Parser } = pkg;

export class ASTParser {
  constructor() {
    this.parser = new Parser();
  }

  /**
   * Parses a SQL string and extracts source and target table dependencies
   * @param {string} sqlString
   * @returns {{ sources: string[], target: string | null }}
   */
  extractDependencies(sqlString) {
    if (!sqlString || typeof sqlString !== 'string') {
      return { sources: [], target: null };
    }

    try {
      // Strip inline comments (-- comment) and block comments (/* comment */)
      const sanitizedSql = sqlString
        .replace(/--.*$/gm, '')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .trim();

      if (!sanitizedSql) return { sources: [], target: null };

      const tableList = this.parser.tableList(sanitizedSql, { database: 'postgresql' });
      if (!Array.isArray(tableList)) return { sources: [], target: null };

      const sources = [];
      let target = null;

      for (const entry of tableList) {
        if (!entry || typeof entry !== 'string') continue;

        const parts = entry.split('::');
        const action = parts[0]?.toLowerCase();
        const tableName = parts[2]?.trim();

        // Skip invalid/empty table names
        if (!tableName || tableName === 'null' || tableName === 'undefined') continue;

        if (action === 'select') {
          if (!sources.includes(tableName)) {
            sources.push(tableName);
          }
        } else if (['insert', 'update', 'create', 'replace'].includes(action)) {
          target = tableName;
        }
      }

      // Filter out self-dependencies (e.g. target table listed in its own sources)
      const cleanSources = target ? sources.filter(src => src !== target) : sources;

      return { sources: cleanSources, target };
    } catch (err) {
      console.warn(`[ASTParser] Warning parsing SQL query: ${err.message}`);
      return { sources: [], target: null };
    }
  }
}