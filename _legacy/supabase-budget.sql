-- ============================================
-- budget_items table: add per-trip columns
-- ============================================
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS trip_id TEXT;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS trip_secret TEXT;
ALTER TABLE budget_items ADD COLUMN IF NOT EXISTS device_id TEXT;

-- Index for per-trip queries
CREATE INDEX IF NOT EXISTS idx_budget_items_trip_id ON budget_items(trip_id);

-- RLS policies
DROP POLICY IF EXISTS "Allow public budget read" ON budget_items;
DROP POLICY IF EXISTS "Allow public budget insert" ON budget_items;
DROP POLICY IF EXISTS "Allow public budget update" ON budget_items;
DROP POLICY IF EXISTS "Allow public budget delete" ON budget_items;

CREATE POLICY "Allow public budget read" ON budget_items FOR SELECT USING (true);
CREATE POLICY "Allow public budget insert" ON budget_items FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public budget update" ON budget_items FOR UPDATE USING (true);
CREATE POLICY "Allow public budget delete" ON budget_items FOR DELETE USING (true);
