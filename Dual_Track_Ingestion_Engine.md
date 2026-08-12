Dual-Track Ingestion Engine:

just to be clear, the feature is like this:
we can somehow need to build connector layer to db snowflake/databricks/postgres (decide whats it gonna be), and then a service that can query it and somehow get the entire table and col of live company db.

and then from there logs or somehitng -> we need to extract all the sql queries that lead to there live db state -> from those individual query -> make a dag graph of tables.

now send each tables with col to scribe agent to mark pii columns and generate business definition of each table.

store dag in neo4j, store table and there col, data types,and pii classificiation in our own postgres/sql(so have to decide schema for that)

and then store embedding of bus def/summaries of each tables in qdrant.

and make a sync function -> that first identifies numbeff of new sql queries that have ran on live db since last time -> and analyze those to update dag graph. and also sync up all table and there columns.
get diff of tables(added/deletes), updated columns.
and only the tables with updated columns are sent for business def/summary.
and only the newly added columns are sent for pii chckecing.