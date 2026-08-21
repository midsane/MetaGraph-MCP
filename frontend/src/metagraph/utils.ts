import { PII_KEYWORDS } from './constants.ts';

/** Scans SQL column definitions for names matching known PII keywords, for the pre-exec warning list. */
export function getRiskHits(sqlInput) {
    return sqlInput.split('\n').flatMap(line => {
        const match = line.match(/^\s*(\w+)\s+(VARCHAR|INT|UUID|TEXT|DATE|CHAR|DECIMAL)/i);
        return match && PII_KEYWORDS.some(keyword => match[1].toLowerCase().includes(keyword)) ? [match[1]] : [];
    });
}

/** Counts non-empty, semicolon-separated SQL statements in the editor input. */
export function getStatementCount(sqlInput) {
    return sqlInput.split(';').filter(statement => statement.trim()).length;
}

// Enriches each lineage node with its catalog-db state (full column list +
// PII count), so the Context Layer graph can render an expandable column
// list directly on the node card without a second lookup. Nodes that only
// exist via a Neo4j edge (picked up from query_logs before syncUp()
// documented their schema) are marked `documented: false` so the graph can
// style them as pending.
export function buildGraphData(lineageData: any, catalogDbTables: any[]) {
    const catalogByName: Record<string, any> = {};
    catalogDbTables.forEach(table => { catalogByName[table.tableName] = table; });

    const nodeIds = new Set<string>((lineageData.nodes || []).map((node: any) => node.id));
    catalogDbTables.forEach(table => nodeIds.add(table.tableName));

    const nodes = Array.from(nodeIds).map(id => {
        const table = catalogByName[id];
        return {
            id,
            label: id,
            documented: Boolean(table),
            columns: table ? table.columns : [],
            piiCount: table ? table.columns.filter((column: any) => column.isPii).length : 0,
        };
    });

    // React Flow edges use {source, target} natively - same shape the API returns.
    const edges = (lineageData.edges || []).map((edge: any) => ({ source: edge.source, target: edge.target }));

    return { nodes, edges };
}

/** Builds the "Ask a question" starter-prompt chips from the current catalog. */
export function buildSuggestions(catalog) {
    return [
        'Show every column flagged as PII',
        ...catalog.slice(0, 2).map(table => `Describe ${table.tableName}`),
    ];
}

