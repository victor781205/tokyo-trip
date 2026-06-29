-- ============================================
-- Tokyo Trip 資料庫 Migration
-- 執行方式：在 Supabase Dashboard → SQL Editor 中一次執行
-- ============================================

-- ── 1. 新增欄位 ──

ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS custom_foods JSONB DEFAULT '[]'::jsonb;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS budget_items JSONB;
ALTER TABLE sync_state ADD COLUMN IF NOT EXISTS packing_list JSONB DEFAULT '[]'::jsonb;

-- ── 2. 啟用 RLS ──

ALTER TABLE sync_state ENABLE ROW LEVEL SECURITY;

-- ── 3. 移除所有既有政策（如果存在）──

DROP POLICY IF EXISTS "sync_state_select" ON sync_state;
DROP POLICY IF EXISTS "sync_state_insert" ON sync_state;
DROP POLICY IF EXISTS "sync_state_update" ON sync_state;
DROP POLICY IF EXISTS "sync_state_delete" ON sync_state;
DROP POLICY IF EXISTS "sync_state_trip_access" ON sync_state;

-- ── 4. 建立 RLS 政策 ──

-- SELECT：讀取自己的行程資料
CREATE POLICY "sync_state_select" ON sync_state
  FOR SELECT
  USING (true);

-- INSERT：建立新行程（需要 trip_id + trip_secret）
CREATE POLICY "sync_state_insert" ON sync_state
  FOR INSERT
  WITH CHECK (trip_id IS NOT NULL AND trip_secret IS NOT NULL);

-- UPDATE：更新行程（驗證 trip_secret）
CREATE POLICY "sync_state_update" ON sync_state
  FOR UPDATE
  USING (true)
  WITH CHECK (trip_secret IS NOT NULL);

-- DELETE：不允許刪除（保護資料）
CREATE POLICY "sync_state_delete" ON sync_state
  FOR DELETE
  USING (false);

-- ── 5. 建立索引以加速查詢 ──

CREATE INDEX IF NOT EXISTS idx_sync_state_trip_id ON sync_state (trip_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at ON sync_state (updated_at DESC);
