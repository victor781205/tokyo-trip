-- 啟用 RLS
ALTER TABLE foods ENABLE ROW LEVEL SECURITY;

-- 允許 anon 角色存取
GRANT ALL ON foods TO anon;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;

-- 建立 RLS 政策（先刪除舊的再建立）
DROP POLICY IF EXISTS "Allow public read foods" ON foods;
DROP POLICY IF EXISTS "Allow public insert foods" ON foods;
DROP POLICY IF EXISTS "Allow public update foods" ON foods;
DROP POLICY IF EXISTS "Allow public delete foods" ON foods;

CREATE POLICY "Allow public read foods" ON foods
  FOR SELECT USING (true);

CREATE POLICY "Allow public insert foods" ON foods
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update foods" ON foods
  FOR UPDATE USING (true);

CREATE POLICY "Allow public delete foods" ON foods
  FOR DELETE USING (true);
