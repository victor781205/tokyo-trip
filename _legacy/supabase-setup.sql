-- ============================================
-- foods table: add per-trip columns
-- ============================================
ALTER TABLE foods ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS trip_secret TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE foods ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Index for per-trip queries
CREATE INDEX IF NOT EXISTS idx_foods_trip_id ON foods(trip_id);

-- RLS policies (already enabled, just ensure they exist)
DROP POLICY IF EXISTS "Allow public read foods" ON foods;
DROP POLICY IF EXISTS "Allow public insert foods" ON foods;
DROP POLICY IF EXISTS "Allow public update foods" ON foods;
DROP POLICY IF EXISTS "Allow public delete foods" ON foods;

CREATE POLICY "Allow public read foods" ON foods FOR SELECT USING (true);
CREATE POLICY "Allow public insert foods" ON foods FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update foods" ON foods FOR UPDATE USING (true);
CREATE POLICY "Allow public delete foods" ON foods FOR DELETE USING (true);
