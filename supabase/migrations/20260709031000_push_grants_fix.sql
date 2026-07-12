-- ============================================
-- 補齊 table grants + 驗證目前 role 權限
-- 若 API 回 permission denied for table push_subscriptions，
-- 多半是：
--   A) service_role 沒有 GRANT（本腳本修）
--   B) Vercel 的 SUPABASE_SERVICE_ROLE_KEY 其實是 anon JWT（需到 Vercel 改）
-- ============================================

-- 1) 明確授權
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- sync_state：前端可讀寫（仍受 RLS 限制）
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;

-- push_subscriptions：只給 service_role
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;

-- 2) 確認 policy 仍正確（push 應只有 service_all）
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
  END AS command
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN ('sync_state', 'push_subscriptions')
ORDER BY 1, 2;

-- 3) 表層級權限（重點看 service_role 對 push_subscriptions 是否有 arwd）
SELECT
  grantee,
  table_name,
  string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privileges
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('sync_state', 'push_subscriptions')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres')
GROUP BY grantee, table_name
ORDER BY table_name, grantee;

-- 4) 角色 bypass 狀態
SELECT rolname, rolbypassrls
FROM pg_roles
WHERE rolname IN ('anon', 'authenticated', 'service_role', 'postgres');
