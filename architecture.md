we are gonna have three pipelines in this project:

1. ingestion
-> first of all, I have 4 types of data storage:
    a. postgres container having company business data 
    b. postgres container of this project that will store tables, clumns, pii tagged columns
    c. vector db qdrant -> storing embedded vectors of business defintion of each columns and metadata like id of that table in project postgres to retrive more information about it if required.
    d. neo4j -> storing relationship (dag) between different tables

now build a connector layer to business postgres with this functions:
    a. syncup -> first figure all tables with there columns from live business storage, get its diff from tables, columns stored in project postgres and update the projects postgres (tables , columns)

    -> send updated tables(if columns changed) -> for new business defintion generation to a agent
    -> send new columns for pii checking

    and then update the vector db as well, delete embedding of tables busineess tables which are deleted now

    b. also get the new sql queries that ran on company postgres since last time, from each of this query extract dependency to update the dag graph in neo4j


We also need a simple event-driven way to call syncup in the background when live company database changes.

-->Scribe agent is the one that does pii tagging and business def generation of tables

2. context layer
--> so our context layers has neo4j tables lineage dag, vector db tables business defintion embedding, (all tables+cols+pii tagged col) in project postgres

expose mcp tools like ->
a. getlineage(tablename) -> it will return subgraph around node tablename
b. semanticSearch(query) -> it will match query with vectors in vector db
c. getAllColumns(tablename,userRole: "analyst"|"admin") -> give columns of a table with RBAC , dont provide pii tagged columns with userRole analysst

3. ai agent runtime
-> inhouse while loop(ai agent runtime)-> that accepts user query and has access to each to the mcp tools. 

it also has a skill -> write sql query -> which have proper directive like check downstream impact via lineage dag before writing a query , etc.

so if user asks to write a query -> ai agent loads this skills first and does task
accordingly


┌───────────────────────────┐      ┌───────────────────────────┐
│ Live Database (Postgres)  │      │ SQL Migration / dbt Files │
│ (information_schema)      │      │ (Raw DDL / Query Logs)    │
└─────────────┬─────────────┘      └─────────────┬─────────────┘
              │                                  │
     (Ground Truth State)                (AST Lineage Extraction)
              │                                  │
              ▼                                  ▼
┌──────────────────────────────────────────────────────────────┐
│                  DUAL-TRACK INGESTION ENGINE                 │
└─────────────────────────────┬────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│               SCRIBE AGENT (AI Documentation)                │
│    (Delta PII Tagging & LLM Business Definition Generator)   │
└─────────────────────────────┬────────────────────────────────┘
                              │
══════════════════════════════╧════════════════════════════════
╔══════════════════════════════════════════════════════════════╗
║                        CONTEXT LAYER                         ║
║                                                              ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │                POLYGLOT STORAGE LAYER                  │  ║
║  │ ┌──────────────────┬──────────────────┬──────────────┐ │  ║
║  │ │ Postgres         │ Neo4j            │ Qdrant       │ │  ║
║  │ │ (Catalog State)  │ (Lineage Graph)  │ (Vector RAG) │ │  ║
║  │ │ Tables, Cols, PII│ DAG Nodes/Edges  │ Business Defs│ │  ║
║  │ └──────────────────┴──────────────────┴──────────────┘ │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │             DETERMINISTIC RBAC & MASKING LAYER         │  ║
║  │           (Role-based PII Redaction: ADMIN/ANALYST)    │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
║                              │                               ║
║                              ▼                               ║
║  ┌────────────────────────────────────────────────────────┐  ║
║  │             MCP SERVER (Context-as-a-Service)          │  ║
║  │   Tools: search_catalog, check_downstream_impact, etc. │  ║
║  └───────────────────────────┬────────────────────────────┘  ║
╚══════════════════════════════╪═══════════════════════════════╝
                               │
                               ▼
┌──────────────────────────────────────────────────────────────┐
│                    EXTERNAL AI CONSUMERS                     │
│         (Claude Desktop, Cursor IDE, Custom AI Agents)       │
└──────────────────────────────────────────────────────────────┘




--> We also need a frontend UI where with a query tab aprat from cli -> to check how the ai agent works give a query and role.



[Frontend Web UI]
                               │
                      POST /api/ask { query, role }
                               │
                               ▼
                ┌──────────────────────────────┐
                │   /api/ask Single-Agent Loop │
                └──────────────┬───────────────┘
                               │
             Calls Internal Services / MCP Tools:
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
[Qdrant Semantic Search]  [Neo4j Lineage]     [Postgres Schema + RBAC]
       │                       │                       │
       └───────────────────────┼───────────────────────┘
                               │
                               ▼
                 [LLM Generates Governed SQL]
                               │
                               ▼
                     [Returns Response + Lineage Graph to UI]


-> WE also want a section in frontend that shows how data is stored in our context layer 
 a. project postgres tables -> showing tables/col etc stored
 b. neo4j -> showing dag stored (with edges and nodes)
 c. vectordb -> showing embedding stored

-> WE ALSO want a section to where we can business postgres data entry in the frontend -> and option to make changes in it -> to see how context layer updated live with those changes

