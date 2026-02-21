-- BoundlessDB Schema for Supabase
-- Run this migration to set up the event store tables

-- Events (Append-Only Log)
CREATE TABLE IF NOT EXISTS events (
  position BIGSERIAL PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  data JSONB NOT NULL,
  metadata JSONB,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Consistency Key Index (populated by Edge Function on write)
CREATE TABLE IF NOT EXISTS event_keys (
  position BIGINT NOT NULL REFERENCES events(position) ON DELETE CASCADE,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  PRIMARY KEY (position, key_name, key_value)
);

-- Metadata (for config hash tracking, future use)
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Performance Indices
CREATE INDEX IF NOT EXISTS idx_event_type ON events(event_type);
CREATE INDEX IF NOT EXISTS idx_key ON event_keys(key_name, key_value);
CREATE INDEX IF NOT EXISTS idx_key_position ON event_keys(key_name, key_value, position);

-- Grant access to authenticated users (via RLS if needed)
-- Note: Edge Functions use SUPABASE_DB_URL which bypasses RLS
-- If you want RLS, configure it here:

-- ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE event_keys ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow authenticated read" ON events FOR SELECT USING (auth.role() = 'authenticated');
-- CREATE POLICY "Allow authenticated insert" ON events FOR INSERT WITH CHECK (auth.role() = 'authenticated');

COMMENT ON TABLE events IS 'BoundlessDB append-only event log';
COMMENT ON TABLE event_keys IS 'Consistency key index for DCB queries';
COMMENT ON TABLE metadata IS 'Store config hash and other metadata';
