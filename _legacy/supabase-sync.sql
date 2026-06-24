-- ============================================
-- sync_state table: add per-trip columns
-- ============================================
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS trip_secret TEXT;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS budget_limit NUMERIC;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS budget_items JSONB;

-- Indexes for per-trip queries
CREATE INDEX IF NOT EXISTS idx_sync_state_trip_id ON sync_state(trip_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sync_state_trip_id_unique ON sync_state(trip_id) WHERE trip_id IS NOT NULL;

-- Drop ALL existing policies on sync_state
DROP POLICY IF EXISTS "Allow public sync read" ON sync_state;
DROP POLICY IF EXISTS "Allow public sync upsert" ON sync_state;
DROP POLICY IF EXISTS "Allow public sync insert" ON sync_state;
DROP POLICY IF EXISTS "Allow public sync update" ON sync_state;
DROP POLICY IF EXISTS "Allow public sync delete" ON sync_state;
DROP POLICY IF EXISTS "Allow public sync delete sync_state" ON sync_state;

-- Recreate policies (secured with trip_secret)
CREATE POLICY "Allow sync read" ON sync_state FOR SELECT USING (true);
CREATE POLICY "Allow sync insert" ON sync_state FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow sync update" ON sync_state FOR UPDATE USING (trip_secret = current_setting('request.headers')::json->>'x-trip-secret');
CREATE POLICY "Allow sync delete" ON sync_state FOR DELETE USING (trip_secret = current_setting('request.headers')::json->>'x-trip-secret');

