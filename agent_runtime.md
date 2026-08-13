
ai agent runtime
-> inhouse while loop(ai agent runtime)-> that accepts user query and has access to each of the mcp tools. 

check and fix if all required mcp tools are already implemented, make a robust runtime agent and cli cmd and api route to invoke it.

it also has a skill -> write sql query -> which have proper directive like check downstream impact via lineage dag before writing a query , etc.

so if user asks to write a query -> ai agent loads this skills first and does task
accordingly.

we can use techinqiues like chunking/hyde/reverse-hyde to improve ai-answers.
RBAC must be followed 

