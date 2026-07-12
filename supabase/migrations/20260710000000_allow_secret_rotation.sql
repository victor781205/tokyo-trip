-- ============================================
-- 允許持有舊 secret 的 client 輪換 trip_secret
-- 日期：2026-07-10
--
-- 問題：
--   舊 UPDATE WITH CHECK 要求「寫入後的 trip_secret」
--   仍等於 header 的 x-trip-secret（舊值），
--   導致 rotateTripSecret() 永遠無法寫入新 secret。
--
-- 修復：
--   USING：必須用舊 secret（header）才能更新該 row
--   WITH CHECK：只驗證新 secret 格式；允許值變更
-- 請在 Supabase SQL Editor 整段執行
-- ============================================

BEGIN;

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

DROP POLICY IF EXISTS "sync_state_update" ON public.sync_state;

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
    AND trip_id IS NOT NULL
    AND length(trip_id) >= 8
  );

COMMIT;

-- 驗證：update policy 的 WITH CHECK 不應再要求 = requesting_trip_secret()
SELECT
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    WHEN '*' THEN 'ALL'
  END AS command,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'sync_state'
  AND p.polname = 'sync_state_update';
