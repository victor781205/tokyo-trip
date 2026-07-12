-- ============================================
-- FORCE FIX: 清掉所有殘留 RLS 政策後重建
-- 回測發現：requesting_trip_secret() 已存在且可讀 header，
-- 但 sync_state 仍可被 anon 無 secret 掃表（含 trip_secret）。
-- 原因多半是「額外 permissive policy 殘留」被 OR 放行。
--
-- 請在 Supabase Dashboard → SQL Editor 整段執行
-- ============================================

-- 0) 確認表存在
DO $$
BEGIN
  IF to_regclass('public.sync_state') IS NULL THEN
    RAISE EXCEPTION 'public.sync_state 不存在';
  END IF;
END $$;

-- 1) Helper：從 request headers 讀 secret
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

-- 2) 動態刪除 sync_state / push_subscriptions 上「全部」policy（不靠名稱）
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

-- 3) 強制啟用 RLS（含 FORCE，避免 table owner bypass 造成誤判）
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;

-- 4) sync_state 政策（僅 secret 相符）
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
    AND trip_secret = public.requesting_trip_secret()
  )
  WITH CHECK (
    trip_secret IS NOT NULL
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_delete" ON public.sync_state
  FOR DELETE
  TO anon, authenticated
  USING (false);

-- 可選：service_role 明確政策（service_role 預設 bypass RLS；有 FORCE 時需要）
CREATE POLICY "sync_state_service_all" ON public.sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_sync_state_trip_id ON public.sync_state (trip_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at ON public.sync_state (updated_at DESC);

-- 5) push_subscriptions：anon 全關；service_role 全開（配合 FORCE RLS）
DO $$
BEGIN
  IF to_regclass('public.push_subscriptions') IS NOT NULL THEN
    ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

    -- 上面 DO 已清掉舊 policy；這裡只建 service_role
    EXECUTE $p$
      CREATE POLICY "push_subscriptions_service_all" ON public.push_subscriptions
        FOR ALL
        TO service_role
        USING (true)
        WITH CHECK (true)
    $p$;

    -- 刻意不給 anon/authenticated 任何 policy
    CREATE INDEX IF NOT EXISTS push_subscriptions_trip_id_idx
      ON public.push_subscriptions (trip_id);
  END IF;
END $$;

-- 6) 驗證查詢（執行後應看到結果）
-- 政策清單
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

-- RLS 旗標
SELECT
  c.relname,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sync_state', 'push_subscriptions');
