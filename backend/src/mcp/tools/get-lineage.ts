import { store } from '../../core/metadata-store.js';

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
  execute: async (args) => {
    // 1. Fetch Upstream (Parents)
    const upstream = store.dag.getUpstream(args.tableName);

    // 2. Fetch Downstream (Children / Impacted Tables)
    const downstream = store.dag.getDownstream(args.tableName);

    // 3. Combine into a unified lineage report
    const lineagePayload = {
      table: args.tableName,
      upstream_dependencies: upstream.upstream_dependencies || [],
      downstream_dependents: downstream.downstream_dependencies || []
    };

    return { 
      content: [{ type: 'text', text: JSON.stringify(lineagePayload, null, 2) }] 
    };
  }
};