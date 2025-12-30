-- Triplit KV Store Schema for Supabase Postgres
-- This migration creates the necessary table and indexes for the Supabase Postgres adapter.
-- Run this in your Supabase SQL editor to set up the KV store.

-- Create the main KV store table
CREATE TABLE IF NOT EXISTS triplit_kv_store (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for efficient range scans
-- This index is crucial for the scan operations which use key prefix matching
CREATE INDEX IF NOT EXISTS idx_triplit_kv_store_key_prefix
  ON triplit_kv_store (key text_pattern_ops);

-- Optional: Create a trigger to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_triplit_kv_store_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_triplit_kv_store_updated_at
  BEFORE UPDATE ON triplit_kv_store
  FOR EACH ROW
  EXECUTE FUNCTION update_triplit_kv_store_updated_at();

-- Enable Row Level Security (RLS) - IMPORTANT for Supabase
ALTER TABLE triplit_kv_store ENABLE ROW LEVEL SECURITY;

-- Create a policy for authenticated users (adjust as needed for your use case)
-- Option 1: Allow all authenticated users full access
CREATE POLICY "Allow authenticated users full access to triplit_kv_store"
  ON triplit_kv_store
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Option 2: If using service role (recommended for server-side usage)
-- You can skip RLS or create specific policies based on your security requirements
-- CREATE POLICY "Allow service role full access to triplit_kv_store"
--   ON triplit_kv_store
--   FOR ALL
--   TO service_role
--   USING (true)
--   WITH CHECK (true);

-- Optional: Grant permissions (adjust based on your security requirements)
GRANT ALL ON TABLE triplit_kv_store TO authenticated;
GRANT ALL ON TABLE triplit_kv_store TO service_role;

-- Add comments for documentation
COMMENT ON TABLE triplit_kv_store IS 'Key-value store for Triplit database using Postgres as the storage backend';
COMMENT ON COLUMN triplit_kv_store.key IS 'Encoded tuple key (lexicographically sortable)';
COMMENT ON COLUMN triplit_kv_store.value IS 'JSON-encoded value';
COMMENT ON COLUMN triplit_kv_store.created_at IS 'Timestamp when the record was created';
COMMENT ON COLUMN triplit_kv_store.updated_at IS 'Timestamp when the record was last updated';
