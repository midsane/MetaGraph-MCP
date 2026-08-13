import { LineageStore } from '../../storage/lineage-store.js';
import { config } from '../../config/env.js';

export const checkDownstreamImpactTool = {
  name: 'check_downstream_impact',
  description:
    'Checks which tables/dashboards depend on (and would break if you alter or drop) the given table. ' +
    'MUST be called for every table referenced before writing a SQL migration, DDL statement, or destructive query.',
  inputSchema: {
    type: 'object',
    properties: {
      tableName: {
        type: 'string',
        description: 'Target table name to check downstream impact for'
      }
    },
    required: ['tableName']
  },
  execute: async (args: any) => {
    const downstream = await LineageStore.getDownstream(args.tableName);

    const payload = {
      table: args.tableName,
      // Any SQL that will actually run against business-db must qualify the
      // table name as "<schema>.<table>" - see execute_business_query.
      schema: config.businessDb.schema,
      downstream_impacted_count: downstream.length,
      downstream_impacted_tables: downstream,
      safe_to_modify: downstream.length === 0,
    };

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }]
    };
  }
};
