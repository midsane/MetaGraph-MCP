export class LineageDAG {
  constructor() {
    this.graph = new Map(); // targetTable -> Set(sourceTables)
  }

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