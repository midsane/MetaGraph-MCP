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
  static async getDownstreamImpact(tableName: string): Promise<string[]> {
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
}