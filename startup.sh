#!/usr/bin/env bash
# Full demo reset + boot: wipes every DB volume, brings the 5 containers back
# up clean, then starts the backend API, the event-driven sync listener, and
# the frontend dev server - so a demo always starts from an empty catalog.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"
LOG_DIR="$ROOT_DIR/.demo-logs"

# Step 1: make sure the log directory exists, and empty out last run's logs
# so `tail -f` at the end of this script only ever shows fresh output.
mkdir -p "$LOG_DIR"
: > "$LOG_DIR/server.log"
: > "$LOG_DIR/sync-watch.log"
: > "$LOG_DIR/frontend.log"

# Step 2: set up process tracking + a cleanup handler. Every background
# process this script starts gets its process-group id (PGID) recorded in
# PGIDS. When the script exits (normally, Ctrl+C, or an error thanks to
# `set -e`), cleanup() runs automatically and kills each tracked group.
PGIDS=()

cleanup() {
  echo ""
  echo "==> Stopping demo processes..."
  for pgid in "${PGIDS[@]}"; do
    kill -TERM -- "-$pgid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  echo "==> Done."
}
trap cleanup EXIT INT TERM

# Launches "$@" in its own process group (via setsid) so cleanup() can kill
# the whole tree - npm/tsx/vite otherwise leave orphaned node processes
# behind when only the wrapper PID gets killed.
start_bg() {
  local logfile="$1"; shift
  setsid "$@" >> "$logfile" 2>&1 &
  PGIDS+=("$!")
}

# Step 3: tear down any previous demo run completely, including its
# volumes, so every database starts empty (no leftover tables/lineage/PII
# tags from a prior demo).
echo "==> Wiping all volumes (business-db, catalog-db, neo4j, qdrant) for a clean slate..."
(cd "$BACKEND_DIR" && docker compose down -v)

# Step 4: bring the 5 containers (business-db, catalog-db, neo4j, qdrant,
# adminer) back up fresh, in the background.
echo "==> Starting containers..."
(cd "$BACKEND_DIR" && docker compose up -d)

# Step 5: block until both Postgres containers are actually accepting
# connections, so the backend doesn't try to connect before they're ready.
wait_for_postgres() {
  local container="$1" user="$2" db="$3" tries=0
  echo "==> Waiting for $container to accept connections..."
  until docker exec "$container" pg_isready -U "$user" -d "$db" >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [ "$tries" -gt 60 ]; then
      echo "!! $container never became ready after 60s - check 'docker compose logs $container'"
      exit 1
    fi
    sleep 1
  done
}

# Step 6: wait for both business-db and catalog-db specifically (Step 5's
# function, called once per database).
wait_for_postgres backend-business-db-1 business_admin business
wait_for_postgres backend-catalog-db-1 admin metagraph

# Step 7: start the 3 app processes (backend API, event-driven sync
# listener, frontend dev server), each logging to its own file.
# NOTE: start_bg is called directly (not inside a `(...)` subshell) so its
# PGIDS+=(...) mutates this script's array rather than a throwaway copy.
cd "$BACKEND_DIR"

echo "==> Starting backend API server (tsx watch)..."
start_bg "$LOG_DIR/server.log" npx tsx watch src/server/app.ts

echo "==> Starting event-driven sync listener..."
start_bg "$LOG_DIR/sync-watch.log" npx tsx src/sync/index.ts watch

cd "$FRONTEND_DIR"

echo "==> Starting frontend dev server..."
start_bg "$LOG_DIR/frontend.log" npx vite

cd "$ROOT_DIR"

# Step 8: give everything a couple seconds to boot before printing the
# summary banner below.
sleep 2

# Step 9: print the demo info banner (URLs + sample SQL to try).
cat <<'EOF'

==================================================================
 MetaGraph demo is up

   Frontend:   http://localhost:5173
   Backend:    http://localhost:3000
   Swagger:    http://localhost:3000/docs
   Neo4j:      http://localhost:7474   (neo4j / password123)
   Adminer:    http://localhost:8080

 Sample SQL for the "Update Business DB" tab (draws a new edge from
 raw_users once applied):

   CREATE TABLE target_db.user_contacts AS
   SELECT id, full_name, email
   FROM target_db.raw_users;

 Logs: .demo-logs/{server,sync-watch,frontend}.log
 Ctrl+C stops everything.
==================================================================

EOF

# Step 10: stream all 3 process logs to this terminal and just sit here.
# The script "ends" only when you hit Ctrl+C (or an error happens), which
# triggers the cleanup() trap from Step 2 to kill everything it started.
tail -f "$LOG_DIR/server.log" "$LOG_DIR/sync-watch.log" "$LOG_DIR/frontend.log"
