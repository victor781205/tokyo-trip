-- 新增 packing_list 欄位到 sync_state 資料表
-- 請在 Supabase Dashboard → SQL Editor 中執行此指令

ALTER TABLE sync_state
ADD COLUMN IF NOT EXISTS packing_list JSONB DEFAULT '[]'::jsonb;

-- 確認欄位已新增
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'sync_state'
ORDER BY ordinal_position;
