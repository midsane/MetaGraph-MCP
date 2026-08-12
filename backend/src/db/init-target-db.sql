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