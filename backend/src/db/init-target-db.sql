CREATE SCHEMA IF NOT EXISTS target_db;

-- 1. Mock "Company" Tables
CREATE TABLE target_db.raw_users (
    id UUID PRIMARY KEY,
    full_name VARCHAR(255),
    email VARCHAR(255),
    ssn VARCHAR(11)
);

CREATE TABLE target_db.stg_users (
    id UUID,
    full_name VARCHAR(255),
    email VARCHAR(255)
);

-- 2. Mock DDL/Migration Query Logs (This is what our AST parser will read)
CREATE TABLE target_db.query_logs (
    id SERIAL PRIMARY KEY,
    query_text TEXT NOT NULL,
    executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Seed the logs so our sync engine has something to parse on first run
INSERT INTO target_db.query_logs (query_text) VALUES
('CREATE TABLE target_db.raw_users (id UUID, full_name VARCHAR(255), email VARCHAR(255), ssn VARCHAR(11));'),
('CREATE TABLE target_db.stg_users AS SELECT id, full_name, email FROM target_db.raw_users;');

-- 4. Event-driven sync hooks.
-- These are created AFTER the seed data above so the initial INSERT/CREATE
-- statements do not fire notifications before MetaGraph's listener is up.
--
-- Any DDL change (CREATE/ALTER/DROP TABLE) OR a new row landing in
-- query_logs (simulating a query that just ran) notifies the
-- 'metagraph_sync' channel. backend/src/core/event-listener.ts LISTENs on
-- this channel and triggers a debounced syncUp().

CREATE OR REPLACE FUNCTION target_db.notify_ddl_change() RETURNS event_trigger AS $$
BEGIN
  PERFORM pg_notify('metagraph_sync', 'ddl_change');
END;
$$ LANGUAGE plpgsql;

CREATE EVENT TRIGGER metagraph_ddl_trigger ON ddl_command_end
EXECUTE FUNCTION target_db.notify_ddl_change();

CREATE OR REPLACE FUNCTION target_db.notify_new_query() RETURNS trigger AS $$
BEGIN
  PERFORM pg_notify('metagraph_sync', 'new_query');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER query_logs_notify_trigger
AFTER INSERT ON target_db.query_logs
FOR EACH ROW EXECUTE FUNCTION target_db.notify_new_query();