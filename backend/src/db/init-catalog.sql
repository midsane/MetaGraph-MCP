CREATE SCHEMA IF NOT EXISTS catalog;

-- Tracks the High-Water Mark for incremental syncing
CREATE TABLE catalog.sync_state (
    id SERIAL PRIMARY KEY,
    last_synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_processed_query_id INT DEFAULT 0
);

-- Stores the Tables
CREATE TABLE catalog.tables (
    id SERIAL PRIMARY KEY,
    table_name VARCHAR(255) UNIQUE NOT NULL,
    business_summary TEXT,           
    is_active BOOLEAN DEFAULT TRUE,  
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stores the Columns and PII tags
CREATE TABLE catalog.columns (
    id SERIAL PRIMARY KEY,
    table_id INT REFERENCES catalog.tables(id) ON DELETE CASCADE,
    column_name VARCHAR(255) NOT NULL,
    data_type VARCHAR(100) NOT NULL,
    is_pii BOOLEAN DEFAULT FALSE,    
    pii_reason VARCHAR(255),         
    is_active BOOLEAN DEFAULT TRUE,
    UNIQUE(table_id, column_name)
);

-- Insert initial watermark
INSERT INTO catalog.sync_state (last_processed_query_id) VALUES (0);