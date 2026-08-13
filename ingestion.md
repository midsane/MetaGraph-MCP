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
