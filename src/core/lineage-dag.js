export class LineageDAG {
  constructor() {
    this.graph = new Map(); // targetTable -> Set(sourceTables)
  }

  /**
   * Add a directed edge from target to source dependency
   */
  addEdge(target, source) {
    if (!target) return;
    if (!this.graph.has(target)) {
      this.graph.set(target, new Set());
    }
    if (source) {
      this.graph.get(target).add(source);
      if (!this.graph.has(source)) {
        this.graph.set(source, new Set());
      }
    }
  }

  /**
   * Returns direct parent (upstream) tables as an array
   */
  getParents(tableName) {
    const parents = this.graph.get(tableName);
    return parents ? Array.from(parents) : [];
  }

  /**
   * Traverse DAG recursively to get all upstream dependencies
   */
  getUpstream(tableName) {
    const visited = new Set();
    const queue = [tableName];
    const upstream = [];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!visited.has(current)) {
        visited.add(current);
        if (current !== tableName) upstream.push(current);

        const parents = this.graph.get(current);
        if (parents) {
          parents.forEach(p => queue.push(p));
        }
      }
    }

    return { table: tableName, upstream_dependencies: upstream };
  }

  /**
   * Traverse DAG to get all downstream impact dependencies
   * (Which tables depend ON this table?)
   */
  getDownstream(tableName) {
    const downstream = [];
    const visited = new Set();
    const queue = [tableName];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!visited.has(current)) {
        visited.add(current);
        if (current !== tableName) downstream.push(current);

        // Find all nodes that have 'current' as a source
        for (const [target, sources] of this.graph.entries()) {
          if (sources.has(current)) {
            queue.push(target);
          }
        }
      }
    }

    return { table: tableName, downstream_dependencies: downstream };
  }

  /**
   * Export graph nodes and edges for visual rendering (e.g. Vis.js / React Flow)
   */
  exportGraph() {
    const nodes = [];
    const edges = [];

    for (const [target, sources] of this.graph.entries()) {
      if (!nodes.some(n => n.id === target)) nodes.push({ id: target, label: target });
      for (const src of sources) {
        if (!nodes.some(n => n.id === src)) nodes.push({ id: src, label: src });
        edges.push({ from: src, to: target });
      }
    }

    return { nodes, edges };
  }
}