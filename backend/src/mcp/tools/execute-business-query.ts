import { businessConnector } from '../../connectors/postgres-connector.js';
import { stripSqlComments } from '../../core/sql-utils.js';
import { config } from '../../config/env.js';
import { isAdmin } from '../../rbac/redact.js';

export const executeBusinessQueryTool = {
  name: 'execute_business_query',
  description:
    'Executes SQL directly against the live business database (business-db) and logs it so the event-driven ' +
    'sync pipeline picks up any resulting schema/lineage change automatically. DESTRUCTIVE AND IRREVERSIBLE - ' +
    'requires ADMIN role and confirm=true. confirm must only be set to true after the human user has explicitly ' +
    'confirmed, in their own separate message, that they want this exact SQL run - never set it in the same turn ' +
    'you first proposed the SQL, and never infer confirmation from an unrelated "yes". Table names must be ' +
    `schema-qualified as "${config.businessDb.schema}.<table_name>" (see the schema field returned by ` +
    'get_governed_schema / check_downstream_impact) - unqualified names can fail or silently miss the table.',
  inputSchema: {
    type: 'object',
    properties: {
      sql: { type: 'string', description: 'One or more semicolon-separated SQL statements to run against business-db.' },
      confirm: { type: 'boolean', description: 'Must be true, and only after explicit user confirmation in a separate message.' },
      userRole: { type: 'string', description: 'User role: ADMIN or ANALYST' },
    },
    required: ['sql', 'confirm', 'userRole'],
  },
  execute: async (args: any) => {
    if (!isAdmin(args.userRole)) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({ error: 'ACCESS DENIED: execute_business_query requires ADMIN role.' }, null, 2),
        }],
      };
    }

    if (args.confirm !== true) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'Not executed: confirm must be explicitly true, and only after the user has confirmed this exact statement in their own message.',
          }, null, 2),
        }],
      };
    }

    const cleanSql = stripSqlComments(args.sql || '');
    const { statementsApplied } = await businessConnector.applyAndLog(cleanSql);

    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          statementsApplied,
          message: `${statementsApplied} statement(s) applied to business-db and logged to query_logs. Catalog-db/Neo4j/Qdrant will update automatically once the event-driven sync (npm run sync:watch) picks it up.`,
        }, null, 2),
      }],
    };
  },
};
