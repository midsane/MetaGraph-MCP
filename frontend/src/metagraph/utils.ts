import { PII_KEYWORDS } from './constants.ts';
import { backendBaseUrl } from './api.ts';

export function getRiskHits(sqlInput) {
    return sqlInput.split('\n').flatMap(line => {
        const match = line.match(/^\s*(\w+)\s+(VARCHAR|INT|UUID|TEXT|DATE|CHAR|DECIMAL)/i);
        return match && PII_KEYWORDS.some(keyword => match[1].toLowerCase().includes(keyword)) ? [match[1]] : [];
    });
}

export function getStatementCount(sqlInput) {
    return sqlInput.split(';').filter(statement => statement.trim()).length;
}

export function buildGraphData(lineageData, catalog) {
    const known = new Map((lineageData.nodes || []).map(node => [node.id, { id: node.id, label: node.id }]));

    catalog.forEach(table => {
        known.set(table.tableName, { id: table.tableName, label: table.tableName });
    });

    // The API returns Neo4j-shaped {source, target} edges; vis-network (LineageGraph) expects {from, to}.
    const edges = (lineageData.edges || []).map(edge => ({ from: edge.source, to: edge.target }));

    return { nodes: [...known.values()], edges };
}

export function buildSuggestions(catalog) {
    return [
        'Show every column flagged as PII',
        ...catalog.slice(0, 2).map(table => `Describe ${table.tableName}`),
    ];
}

