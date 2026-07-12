-- ============================================
-- SECURITY HARDENING: sync_state + push_subscriptions RLS
-- 執行方式：Supabase Dashboard → SQL Editor 一次執行
-- 日期：2026-07-09
-- ============================================
-- 目標：
-- 1. 禁止匿名 anon 掃表讀取所有行程 / secret
-- 2. SELECT / UPDATE 必須帶 x-trip-secret header 且與 row 相符
-- 3. push_subscriptions 僅允許 service_role（API 驗證 secret 後寫入）
-- ============================================

-- ── Helper：從 request headers 讀取 trip secret ──
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

-- ════════════════════════════════════════════
-- 1) sync_state
-- ════════════════════════════════════════════

ALTER TABLE IF EXISTS public.sync_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_state_select" ON public.sync_state;
DROP POLICY IF EXISTS "sync_state_insert" ON public.sync_state;
DROP POLICY IF EXISTS "sync_state_update" ON public.sync_state;
DROP POLICY IF EXISTS "sync_state_delete" ON public.sync_state;
DROP POLICY IF EXISTS "sync_state_trip_access" ON public.sync_state;
DROP POLICY IF EXISTS "Allow sync select" ON public.sync_state;
DROP POLICY IF EXISTS "Allow sync insert" ON public.sync_state;
DROP POLICY IF EXISTS "Allow sync update" ON public.sync_state;
DROP POLICY IF EXISTS "Allow sync delete" ON public.sync_state;

-- SELECT：只能讀 header 中 secret 相符的 row
CREATE POLICY "sync_state_select" ON public.sync_state
  FOR SELECT
  TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trip_secret) >= 8
    AND trip_secret = public.requesting_trip_secret()
  );

-- INSERT：必須自帶 trip_id + trip_secret，且 secret 與 header 一致
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

-- UPDATE：既有 row 的 secret 必須等於 header；寫入後 secret 也不可被偷換
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

-- DELETE：禁止（保護資料）
CREATE POLICY "sync_state_delete" ON public.sync_state
  FOR DELETE
  TO anon, authenticated
  USING (false);

CREATE INDEX IF NOT EXISTS idx_sync_state_trip_id ON public.sync_state (trip_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_updated_at ON public.sync_state (updated_at DESC);

-- ════════════════════════════════════════════
-- 2) push_subscriptions
-- ════════════════════════════════════════════
-- 前端不再直接用 anon 寫入；一律走 /api/push/subscribe（service_role）。
-- 因此對 anon/authenticated 關閉所有政策（RLS enable + 無 policy = 拒絕）。

ALTER TABLE IF EXISTS public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS push_subscriptions_anon_upsert ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_anon_update ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_anon_select ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_anon_insert ON public.push_subscriptions;
DROP POLICY IF EXISTS push_subscriptions_anon_delete ON public.push_subscriptions;

-- 刻意不建立 anon/authenticated 政策：
-- service_role 會 bypass RLS，API 路由驗證 trip_secret 後再操作。

CREATE INDEX IF NOT EXISTS push_subscriptions_trip_id_idx
  ON public.push_subscriptions (trip_id);

-- 完成後請用另一組 anon key 驗證：
--   select * from sync_state;           -- 應回空（無 header）
--   select * from push_subscriptions;   -- 應被拒或空
