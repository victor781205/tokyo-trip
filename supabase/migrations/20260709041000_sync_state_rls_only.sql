-- ============================================
-- 只修 sync_state RLS（push 已 OK，勿動 push 表）
-- 症狀：anon 無 secret 可 SELECT 到 trip_secret
-- 請整段在 SQL Editor 執行
-- ============================================

BEGIN;

-- 1) helper
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

-- 2) 刪掉 sync_state 上全部 policy
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT pol.polname AS policy_name
    FROM pg_policy pol
    JOIN pg_class cls ON cls.oid = pol.polrelid
    JOIN pg_namespace nsp ON nsp.oid = cls.relnamespace
    WHERE nsp.nspname = 'public' AND cls.relname = 'sync_state'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sync_state', r.policy_name);
    RAISE NOTICE 'dropped %', r.policy_name;
  END LOOP;
END $$;

-- 3) 強制 RLS
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;

-- 4) 重建最小政策（禁止 USING(true)）
CREATE POLICY "sync_state_select" ON public.sync_state
  FOR SELECT TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_insert" ON public.sync_state
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    trip_id IS NOT NULL
    AND trip_secret IS NOT NULL
    AND length(trip_id) >= 8
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_update" ON public.sync_state
  FOR UPDATE TO anon, authenticated
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
  FOR DELETE TO anon, authenticated
  USING (false);

CREATE POLICY "sync_state_service_all" ON public.sync_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- 5) grants（RLS 仍會擋）
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;

COMMIT;

-- 6) 驗證：政策清單（應 5 筆，using_expr 不該是單純 true，除了 service_all）
SELECT
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS command,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'sync_state'
ORDER BY 1;

-- 7) 旗標
SELECT relname, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND relname = 'sync_state';

-- 期望：
-- policies: select/insert/update/delete/service_all
-- select 的 using_expr 含 requesting_trip_secret()
-- rls_enabled=true, rls_forced=true
