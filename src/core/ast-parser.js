import pkg from 'node-sql-parser';
const { Parser } = pkg;

export class ASTParser {
  constructor() {
    this.parser = new Parser();
  }

  extractDependencies(sqlString) {
    try {
      const tableList = this.parser.tableList(sqlString, { database: 'postgresql' });
      if (!Array.isArray(tableList)) return { sources: [], target: null };

      const sources = [];
      let target = null;

      for (const entry of tableList) {
        const parts = entry.split('::');
        const action = parts[0];
        const tableName = parts[2];

        if (action === 'select') {
          if (!sources.includes(tableName)) sources.push(tableName);
        } else if (['insert', 'update', 'create'].includes(action)) {
          target = tableName;
        }
      }

      return { sources, target };
    } catch (err) {
      console.error(`[ASTParser] Failed to parse SQL query: ${err.message}`);
      return { sources: [], target: null };
    }
  }
}