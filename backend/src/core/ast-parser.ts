import pkg from 'node-sql-parser';
const { Parser } = pkg;

export class ASTParser {
  private parser: InstanceType<typeof Parser>;

  constructor() {
    this.parser = new Parser();
  }

  /**
   * Extracts Lineage dependencies (INSERT / SELECT / CREATE TABLE AS)
   */
  extractDependencies(sqlString) {
    try {
      const sanitizedSql = sqlString.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
      if (!sanitizedSql) return { sources: [], target: null };

      const tableList = this.parser.tableList(sanitizedSql, { database: 'postgresql' });
      if (!Array.isArray(tableList)) return { sources: [], target: null };

      const sources = [];
      let target = null;

      for (const entry of tableList) {
        if (!entry) continue;
        const parts = entry.split('::');
        const action = parts[0]?.toLowerCase();
        const tableName = parts[2]?.trim();

        if (!tableName || tableName === 'null') continue;

        if (action === 'select') {
          if (!sources.includes(tableName)) sources.push(tableName);
        } else if (['insert', 'update', 'create', 'replace'].includes(action)) {
          target = tableName;
        }
      }

      return { sources: target ? sources.filter(s => s !== target) : sources, target };
    } catch (err) {
      return { sources: [], target: null };
    }
  }

  /**
   * Extracts Table Schemas (DDL CREATE TABLE, CTAS, and ALTER TABLE)
   */
  extractDDLSchemas(sqlString) {
    const tables = [];

    // 1. Standard CREATE TABLE (...) Parser
    const createRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s*\(([\s\S]*?)\);/gi;
    let match;

    while ((match = createRegex.exec(sqlString)) !== null) {
      const tableName = match[1];
      const body = match[2];

      // Split by commas ONLY outside of parentheses (preserves DECIMAL(10,2))
      const columnLines = body.split(/,(?![^(]*\))/);

      const columns = columnLines
        .map(line => line.trim().split(/\s+/)[0])
        .filter(col => col && !['PRIMARY', 'FOREIGN', 'CONSTRAINT', 'UNIQUE', 'CHECK'].includes(col.toUpperCase()));

      tables.push({ type: 'CREATE', tableName, columns });
    }

    // 2. CTAS Parser: CREATE TABLE table_name AS SELECT ... FROM
    const ctasRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([a-zA-Z0-9_]+)\s+AS\s+SELECT\s+([\s\S]*?)\s+FROM/gi;
    let ctasMatch;

    while ((ctasMatch = ctasRegex.exec(sqlString)) !== null) {
      const tableName = ctasMatch[1];
      const selectClause = ctasMatch[2];

      // Extract column names or aliases (e.g. "u.id AS user_id" -> "user_id", "amount_usd" -> "amount_usd")
      const selectItems = selectClause.split(/,(?![^(]*\))/);
      const columns = selectItems.map(item => {
        const parts = item.trim().split(/\s+AS\s+|\s+/i);
        return parts[parts.length - 1].replace(/.*\./, '').trim(); // Remove table aliases (e.g. u.full_name -> full_name)
      }).filter(col => col && col !== '*');

      tables.push({ type: 'CREATE', tableName, columns });
    }

    // 3. ALTER TABLE ADD COLUMN Parser
    const alterRegex = /ALTER\s+TABLE\s+([a-zA-Z0-9_]+)\s+ADD\s+(?:COLUMN\s+)?([a-zA-Z0-9_]+)/gi;
    let alterMatch;

    while ((alterMatch = alterRegex.exec(sqlString)) !== null) {
      const tableName = alterMatch[1];
      const addedColumn = alterMatch[2];

      tables.push({ type: 'ALTER_ADD', tableName, columns: [addedColumn] });
    }

    return tables;
  }
}
