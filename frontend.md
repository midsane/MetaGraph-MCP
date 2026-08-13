currently we two route in fronted:
/exec -> get sql query -> applies on business db
/sync -> sync business db to our context layer

we want to show business db and our context layer in a proper ui for demo on our frontend:
so we need backend routes:

/retreive-business-db
/retreive-catalog-db
/retreive-lineage-dag (show proper graph visulazation on the frontend)
-> i dont think we should be showing vector-db /since thats not readable

also provide ui to sync up and exec (sql query on business db) on the frontend