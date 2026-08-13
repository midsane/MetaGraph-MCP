import { neo4jDriver } from '../config/neo4j.js';

export class LineageStore {
  /**
   * Adds a bi-directional dependency edge.
   * Concept: targetTable DEPENDS_ON sourceTable
   */
  static async addDependency(targetTable: string, sourceTable: string) {
    const session = neo4jDriver.session();
    try {
      await session.run(`
        MERGE (target:Table {name: $targetTable})
        MERGE (source:Table {name: $sourceTable})
        MERGE (target)-[:DEPENDS_ON]->(source)
      `, { targetTable, sourceTable });
    } finally {
      await session.close();
    }
  }

  /**
   * Traverses the DAG to find every table/dashboard that will break
   * if the target table is altered or dropped.
   */
  static async getDownstream(tableName: string): Promise<string[]> {
    const session = neo4jDriver.session();
    try {
      // The `*` indicates a recursive graph traversal across any number of hops
      const res = await session.run(`
        MATCH (downstream:Table)-[:DEPENDS_ON*]->(target:Table {name: $tableName})
        RETURN DISTINCT downstream.name AS name
      `, { tableName });

      return res.records.map(record => record.get('name') as string);
    } finally {
      await session.close();
    }
  }

  /**
   * Traverses the DAG to find every upstream source table that the given
   * table (directly or transitively) depends on.
   */
  static async getUpstream(tableName: string): Promise<string[]> {
    const session = neo4jDriver.session();
    try {
      const res = await session.run(`
        MATCH (target:Table {name: $tableName})-[:DEPENDS_ON*]->(upstream:Table)
        RETURN DISTINCT upstream.name AS name
      `, { tableName });

      return res.records.map(record => record.get('name') as string);
    } finally {
      await session.close();
    }
  }

  /**
   * Exports the full lineage DAG as nodes/edges for the frontend graph
   * visualization and the /api/lineage route.
   */
  static async getFullGraph(): Promise<{ nodes: { id: string }[]; edges: { source: string; target: string }[] }> {
    const session = neo4jDriver.session();
    try {
      const res = await session.run(`
        MATCH (target:Table)
        OPTIONAL MATCH (target)-[:DEPENDS_ON]->(source:Table)
        RETURN target.name AS target, source.name AS source
      `);

      const nodeNames = new Set<string>();
      const edges: { source: string; target: string }[] = [];

      for (const record of res.records) {
        const target = record.get('target') as string;
        const source = record.get('source') as string | null;
        nodeNames.add(target);
        if (source) {
          nodeNames.add(source);
          edges.push({ source, target });
        }
      }

      return {
        nodes: Array.from(nodeNames).map(id => ({ id })),
        edges,
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Removes a table (and its lineage edges) from Neo4j when it is dropped
   * from the live business database.
   */
  static async deleteTableNode(tableName: string) {
    const session = neo4jDriver.session();
    try {
      await session.run(`
        MATCH (t:Table {name: $tableName})
        DETACH DELETE t
      `, { tableName });
    } finally {
      await session.close();
    }
  }

  /** Deletes the entire lineage graph. Used by /api/purge. */
  static async purge() {
    const session = neo4jDriver.session();
    try {
      await session.run(`MATCH (n) DETACH DELETE n`);
    } finally {
      await session.close();
    }
  }
}