import { LineageStore } from '../../storage/lineage-store.js';

export const getLineageTool = {
  name: 'get_table_lineage',
  description: 'Retrieves 360-degree lineage (both upstream source dependencies and downstream impact dependents) for a specific database table.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Target table name to inspect lineage for'
      }
    },
    required: ['tableName']
  },
  /** Fetches both upstream sources and downstream dependents for a table from the Neo4j lineage graph. */
  execute: async (args) => {
    // 1. Fetch Upstream (Parents) and Downstream (Children / Impacted Tables) from Neo4j
    const [upstream, downstream] = await Promise.all([
      LineageStore.getUpstream(args.tableName),
      LineageStore.getDownstream(args.tableName),
    ]);

    const lineagePayload = {
      table: args.tableName,
      upstream_dependencies: upstream,
      downstream_dependents: downstream
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(lineagePayload, null, 2) }]
    };
  }
};
