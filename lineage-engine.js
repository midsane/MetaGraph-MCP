import pkg from 'node-sql-parser';
const { Parser } = pkg;

export class LineageEngine {
    constructor() {
        this.parser = new Parser();
        // Directed Acyclic Graph (DAG) for lineage: table -> set of dependencies
        this.graph = new Map();
    }

    /**
     * Parses an array of SQL queries and updates the lineage DAG.
     * @param {string[]} sqlQueries 
     */
    parseQueries(sqlQueries) {
        for (const sql of sqlQueries) {
            try {
                // Extract table and column dependencies via AST
                // ✅ CORRECT: The method directly returns the tableList array
                const tableList = this.parser.tableList(sql, { database: 'postgresql' });
                if (!Array.isArray(tableList)) continue;
                // tableList outputs array like: ["select::null::stg_orders", "insert::null::mrt_revenue"]
                const sourceTables = [];
                let targetTable = null;

                for (const entry of tableList) {
                    const parts = entry.split('::');
                    const action = parts[0];
                    const tableName = parts[2];

                    if (action === 'select') {
                        if (!sourceTables.includes(tableName)) sourceTables.push(tableName);
                    } else if (['insert', 'update', 'create'].includes(action)) {
                        targetTable = tableName;
                    }
                }

                // Add to Lineage Graph
                if (targetTable) {
                    if (!this.graph.has(targetTable)) {
                        this.graph.set(targetTable, new Set());
                    }
                    sourceTables.forEach(src => this.graph.get(targetTable).add(src));
                } else {
                    // If pure select, record standalone nodes
                    sourceTables.forEach(src => {
                        if (!this.graph.has(src)) this.graph.set(src, new Set());
                    });
                }
            } catch (err) {
                console.warn(`[LineageEngine] Warning parsing SQL: ${err.message}`);
            }
        }
    }

    /**
     * Returns upstream lineage for a specific table.
     */
    getUpstreamLineage(tableName) {
        const visited = new Set();
        const queue = [tableName];
        const dependencies = [];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!visited.has(current)) {
                visited.add(current);
                if (current !== tableName) dependencies.push(current);

                const parents = this.graph.get(current);
                if (parents) {
                    parents.forEach(parent => queue.push(parent));
                }
            }
        }

        return { table: tableName, upstream_dependencies: dependencies };
    }

    /**
     * Exports the entire lineage graph formatted for visual rendering.
     */
    getGraphExport() {
        const nodes = [];
        const edges = [];

        for (const [target, sources] of this.graph.entries()) {
            nodes.push({ id: target, label: target });
            for (const src of sources) {
                if (!nodes.some(n => n.id === src)) {
                    nodes.push({ id: src, label: src });
                }
                edges.push({ from: src, to: target });
            }
        }

        return { nodes, edges };
    }
}

