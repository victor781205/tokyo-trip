-- ============================================
-- Push via SECURITY DEFINER RPC（anon 可呼叫）
-- 解決：Vercel SUPABASE_SERVICE_ROLE_KEY 無效/填成 anon
--       導致 permission denied for table push_subscriptions
--
-- 安全模型：
--   - 表本身仍對 anon REVOKE + 無 RLS policy
--   - 只透過 RPC 寫入/讀取，且必須 trip_secret 正確
-- 請在 Supabase SQL Editor 整段執行
-- ============================================

-- 確保表權限仍鎖住直連
REVOKE ALL ON TABLE public.push_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.push_subscriptions FROM anon, authenticated;
GRANT ALL ON TABLE public.push_subscriptions TO service_role;
GRANT ALL ON TABLE public.push_subscriptions TO postgres;

GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;

-- ────────────────────────────────────────────
-- 1) 訂閱 upsert：驗證 secret 後寫入
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_push_subscription(
  p_trip_id text,
  p_trip_secret text,
  p_token text,
  p_platform text,
  p_keys jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_secret text;
  v_id uuid;
BEGIN
  IF p_trip_id IS NULL OR length(p_trip_id) < 4 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_trip_secret IS NULL OR length(p_trip_secret) < 8 THEN
    RAISE EXCEPTION 'invalid trip_secret' USING ERRCODE = '22023';
  END IF;
  IF p_token IS NULL OR length(p_token) < 1 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('web', 'ios', 'android') THEN
    RAISE EXCEPTION 'invalid platform' USING ERRCODE = '22023';
  END IF;

  SELECT trip_secret INTO v_existing_secret
  FROM public.sync_state
  WHERE trip_id = p_trip_id
  LIMIT 1;

  -- 行程已存在則必須 secret 吻合；尚不存在則允許先訂閱
  IF v_existing_secret IS NOT NULL AND v_existing_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.push_subscriptions AS ps (trip_id, token, platform, keys, updated_at)
  VALUES (p_trip_id, p_token, p_platform, p_keys, now())
  ON CONFLICT (trip_id, token) DO UPDATE
    SET platform = EXCLUDED.platform,
        keys = EXCLUDED.keys,
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_push_subscription(text, text, text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text, jsonb)
  TO anon, authenticated, service_role;

-- ────────────────────────────────────────────
-- 2) 列出某行程訂閱（需 secret）
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_push_subscriptions(
  p_trip_id text,
  p_trip_secret text
)
RETURNS TABLE (
  token text,
  platform text,
  keys jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
BEGIN
  IF p_trip_id IS NULL OR p_trip_secret IS NULL OR length(p_trip_secret) < 8 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.trip_secret INTO v_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;

  IF v_secret IS NULL OR v_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ps.token, ps.platform, ps.keys
  FROM public.push_subscriptions ps
  WHERE ps.trip_id = p_trip_id;
END;
$$;

REVOKE ALL ON FUNCTION public.list_push_subscriptions(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_push_subscriptions(text, text)
  TO anon, authenticated, service_role;

-- ────────────────────────────────────────────
-- 3) 刪除失效 token（需 secret）
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_push_tokens(
  p_trip_id text,
  p_trip_secret text,
  p_tokens text[]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text;
  v_count int;
BEGIN
  IF p_trip_id IS NULL OR p_trip_secret IS NULL OR length(p_trip_secret) < 8 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.trip_secret INTO v_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;

  IF v_secret IS NULL OR v_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_subscriptions ps
  WHERE ps.trip_id = p_trip_id
    AND ps.token = ANY (p_tokens);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_push_tokens(text, text, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_push_tokens(text, text, text[])
  TO anon, authenticated, service_role;

-- ────────────────────────────────────────────
-- 4) cron 用：列出有訂閱的 trip（需 cron secret 參數）
--    由 API 傳入 CRON_SECRET，函式比對後才回傳
--    注意：secret 存在函式參數，不寫進 DB
-- ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_push_trips_for_cron(
  p_expected_secret text,
  p_provided_secret text
)
RETURNS TABLE (
  trip_id text,
  trip_secret text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_expected_secret IS NULL OR p_provided_secret IS NULL
     OR length(p_expected_secret) < 8
     OR p_expected_secret IS DISTINCT FROM p_provided_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ps.trip_id, st.trip_secret
  FROM public.push_subscriptions ps
  JOIN public.sync_state st ON st.trip_id = ps.trip_id
  WHERE st.trip_secret IS NOT NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.list_push_trips_for_cron(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_push_trips_for_cron(text, text)
  TO anon, authenticated, service_role;

-- 驗證
SELECT n.nspname, p.proname
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'upsert_push_subscription',
    'list_push_subscriptions',
    'delete_push_tokens',
    'list_push_trips_for_cron'
  )
ORDER BY 2;
