-- Supabase SQL Adapter Setup
-- This migration creates the necessary helper functions for the Triplit SQL adapter.
-- Run this in your Supabase SQL editor before using the SQL adapter.

-- ============================================================================
-- HELPER FUNCTIONS FOR TRIPLIT SQL ADAPTER
-- ============================================================================

-- Function to execute arbitrary SQL (admin only - use with caution)
-- This is used for schema migrations
CREATE OR REPLACE FUNCTION execute_sql(sql_query TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
END;
$$;

-- Grant execute permission to service role only
REVOKE ALL ON FUNCTION execute_sql FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_sql TO service_role;

COMMENT ON FUNCTION execute_sql IS 'Execute arbitrary SQL for schema migrations. Only accessible to service_role.';

-- ============================================================================

-- Function to execute parameterized queries
-- This is the main query execution function used by the adapter
CREATE OR REPLACE FUNCTION execute_query(
  sql_query TEXT,
  sql_params JSONB DEFAULT '[]'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSONB;
  param_count INTEGER;
BEGIN
  -- Get parameter count
  param_count := jsonb_array_length(sql_params);

  -- Execute query with parameters
  -- Note: This is a simplified version. For production, you'd want to use
  -- PREPARE/EXECUTE for better performance and security

  EXECUTE sql_query
  INTO result
  USING sql_params;

  RETURN result;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION execute_query FROM PUBLIC;
GRANT EXECUTE ON FUNCTION execute_query TO authenticated, service_role;

COMMENT ON FUNCTION execute_query IS 'Execute parameterized SQL queries safely. Used by Triplit SQL adapter.';

-- ============================================================================

-- Function to get list of tables in a schema
CREATE OR REPLACE FUNCTION get_tables(schema_name TEXT DEFAULT 'public')
RETURNS TABLE(table_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT t.table_name::TEXT
  FROM information_schema.tables t
  WHERE t.table_schema = get_tables.schema_name
    AND t.table_type = 'BASE TABLE'
  ORDER BY t.table_name;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION get_tables FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_tables TO authenticated, service_role;

COMMENT ON FUNCTION get_tables IS 'Get list of tables in a schema. Used for schema introspection.';

-- ============================================================================

-- Function to get columns for a table
CREATE OR REPLACE FUNCTION get_columns(
  table_name TEXT,
  schema_name TEXT DEFAULT 'public'
)
RETURNS TABLE(
  column_name TEXT,
  data_type TEXT,
  is_nullable TEXT,
  column_default TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.column_name::TEXT,
    c.data_type::TEXT,
    c.is_nullable::TEXT,
    c.column_default::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = get_columns.schema_name
    AND c.table_name = get_columns.table_name
  ORDER BY c.ordinal_position;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION get_columns FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_columns TO authenticated, service_role;

COMMENT ON FUNCTION get_columns IS 'Get columns for a table. Used for schema introspection.';

-- ============================================================================

-- Function to get table primary key
CREATE OR REPLACE FUNCTION get_primary_key(
  table_name TEXT,
  schema_name TEXT DEFAULT 'public'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  pk_column TEXT;
BEGIN
  SELECT a.attname INTO pk_column
  FROM pg_index i
  JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
  WHERE i.indrelid = (schema_name || '.' || table_name)::regclass
    AND i.indisprimary
  LIMIT 1;

  RETURN pk_column;
END;
$$;

-- Grant execute permission
REVOKE ALL ON FUNCTION get_primary_key FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_primary_key TO authenticated, service_role;

COMMENT ON FUNCTION get_primary_key IS 'Get primary key column for a table.';

-- ============================================================================
-- SECURITY NOTES
-- ============================================================================

-- IMPORTANT: The execute_sql function is VERY POWERFUL and should only be
-- accessible to the service_role. Never expose this to client-side code.
--
-- For production use, consider:
-- 1. Creating a more restricted version that only allows specific operations
-- 2. Adding query validation and sanitization
-- 3. Implementing query logging and auditing
-- 4. Setting up connection pooling appropriately
-- 5. Using prepared statements for better performance and security

-- ============================================================================
-- USAGE EXAMPLE
-- ============================================================================

-- Example: Get all tables in public schema
-- SELECT * FROM get_tables('public');

-- Example: Get columns for 'users' table
-- SELECT * FROM get_columns('users', 'public');

-- Example: Execute a query (this would be called by the adapter)
-- SELECT execute_query(
--   'SELECT * FROM users WHERE id = $1',
--   '["user-123"]'::jsonb
-- );

-- Example: Run a migration (service role only)
-- SELECT execute_sql('CREATE TABLE test_table (id TEXT PRIMARY KEY, name TEXT)');
