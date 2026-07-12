-- ============================================
-- FIX: FORCE RLS 下補齊 service_role 政策
-- 症狀：
--   /api/push/subscribe 回 500
--   detail = new row violates row-level security policy for table "push_subscriptions"
--   且 wrong secret 也是 500 而非 403
-- 原因：
--   FORCE ROW LEVEL SECURITY 後，service_role 不再自動 bypass RLS，
--   若沒有 TO service_role 的 policy，API 用 service key 也寫不進去。
--
-- 請在 Supabase Dashboard → SQL Editor 整段執行
-- ============================================

-- 1) 確保 RLS + FORCE 仍在
ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions FORCE ROW LEVEL SECURITY;

-- 2) 先清掉同名 service policy（可重跑）
DROP POLICY IF EXISTS "sync_state_service_all" ON public.sync_state;
DROP POLICY IF EXISTS "push_subscriptions_service_all" ON public.push_subscriptions;
DROP POLICY IF EXISTS sync_state_service_all ON public.sync_state;
DROP POLICY IF EXISTS push_subscriptions_service_all ON public.push_subscriptions;

-- 3) 重建 service_role 全開政策
CREATE POLICY "sync_state_service_all" ON public.sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "push_subscriptions_service_all" ON public.push_subscriptions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 4) 保險：明確授權（Supabase 預設通常已有）
GRANT ALL ON TABLE public.sync_state TO service_role;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;

-- 5) 驗證：應至少看到
--   sync_state: select/insert/update/delete + service_all
--   push_subscriptions: service_all
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
  pg_get_expr(p.polqual, p.polrelid) AS using_expr
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

-- 6) 角色成員檢查（service_role 應存在）
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres', 'authenticator');
