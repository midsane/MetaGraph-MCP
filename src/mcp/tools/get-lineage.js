import { store } from '../../core/metadata-store.js';

export const getLineageTool = {
  name: 'get_table_lineage',
  description: 'Retrieves upstream dependency lineage DAG for a specific database table.',
  inputSchema: {
    type: 'object',
    properties: { tableName: { type: 'string' } },
    required: ['tableName']
  },
  execute: async (args) => {
    const lineage = store.dag.getUpstream(args.tableName);
    return { content: [{ type: 'text', text: JSON.stringify(lineage, null, 2) }] };
  }
};