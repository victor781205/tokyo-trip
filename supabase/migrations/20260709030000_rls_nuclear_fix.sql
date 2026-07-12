-- ============================================
-- NUCLEAR FIX: 一次重建完整 RLS（請整段執行）
-- 回測發現政策又被打成全開：
--   - anon 無 secret 可掃到 trip_secret
--   - 錯誤 secret 可讀/改
--   - push_subscriptions anon 可寫/可掃
--
-- 本腳本會：
--   1) 動態刪除兩表全部 policy
--   2) ENABLE + FORCE RLS
--   3) 重建 secret-based sync_state 政策
--   4) push_subscriptions 僅 service_role
--   5) 明確 GRANT
--   6) 輸出驗證結果
-- ============================================

BEGIN;

-- 0) 表必須存在
DO $$
BEGIN
  IF to_regclass('public.sync_state') IS NULL THEN
    RAISE EXCEPTION 'public.sync_state 不存在';
  END IF;
  IF to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'public.push_subscriptions 不存在';
  END IF;
END $$;

-- 1) helper：讀 x-trip-secret
CREATE OR REPLACE FUNCTION public.requesting_trip_secret()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    COALESCE(
      current_setting('request.headers', true)::json->>'x-trip-secret',
      current_setting('request.headers', true)::json->>'X-Trip-Secret',
      ''
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.requesting_trip_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requesting_trip_secret() TO anon, authenticated, service_role;

-- 2) 刪除兩表全部 policy（不靠名稱）
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pol.polname AS policy_name, cls.relname AS table_name
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public'
      AND cls.relname IN ('sync_state', 'push_subscriptions')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policy_name, r.table_name);
    RAISE NOTICE 'dropped policy %.%', r.table_name, r.policy_name;
  END LOOP;
END $$;

-- 3) ENABLE + FORCE
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

-- 4) sync_state：僅 secret 相符的 anon/authenticated
CREATE POLICY "sync_state_select" ON public.sync_state
  FOR SELECT
  TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_insert" ON public.sync_state
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    trip_id IS NOT NULL
    AND trip_secret IS NOT NULL
    AND length(trip_id) >= 8
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_update" ON public.sync_state
  FOR UPDATE
  TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  )
  WITH CHECK (
    trip_secret IS NOT NULL
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_delete" ON public.sync_state
  FOR DELETE
  TO anon, authenticated
  USING (false);

CREATE POLICY "sync_state_service_all" ON public.sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5) push_subscriptions：anon 全關；只給 service_role
CREATE POLICY "push_subscriptions_service_all" ON public.push_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 刻意不建立任何 TO anon / authenticated 的 policy

-- 6) grants
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;
-- push：anon 不給 DML（即使有 GRANT，無 policy + FORCE = 拒絕）
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

CREATE INDEX IF NOT EXISTS idx_sync_state_trip_id ON public.sync_state (trip_id);
CREATE INDEX IF NOT EXISTS push_subscriptions_trip_id_idx ON public.push_subscriptions (trip_id);

COMMIT;

-- 7) 驗證輸出（執行後請截圖回傳）
SELECT
  c.relname AS table_name,
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
    ELSE p.polcmd::text
  END AS command,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sync_state', 'push_subscriptions')
ORDER BY 1, 2;

SELECT
  c.relname,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sync_state', 'push_subscriptions');

-- 期望：
-- sync_state 政策：select/insert/update/delete + service_all
-- push_subscriptions 政策：只有 service_all
-- 兩表 rls_enabled=true, rls_forced=true
