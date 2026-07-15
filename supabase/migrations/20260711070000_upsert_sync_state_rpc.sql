-- ============================================
-- SECURITY DEFINER RPC：安全 upsert sync_state
-- 日期：2026-07-11
--
-- 背景 / 症狀：
--   前端 .from("sync_state").upsert(...) 在 FORCE RLS 下
--   常回：
--     new row violates row-level security policy for table "sync_state"
--
--   根因（PostgREST + RLS）：
--   1) upsert 一律先走 INSERT WITH CHECK；header / body secret 任一不符即 42501
--   2) 既有 row 但 secret 錯誤時：SELECT 看不到 → 誤當 INSERT →
--      ON CONFLICT 再踩 UPDATE USING 失敗，錯誤訊息仍像「new row violates…」
--   3) 與 rotate_trip_secret 相同：直接表寫入在 FORCE RLS 環境不穩
--
-- 修復：
--   改走 SECURITY DEFINER + row_security=off RPC
--   - 必須提供 length>=8 的 trip_id / trip_secret
--   - 既有 row：secret 必須吻合才 UPDATE 內容（不改 secret）
--   - 無 row：INSERT 新列（id = state_<trip_id>）
--   - secret 不符：明確 forbidden
--
-- 請在 Supabase Dashboard → SQL Editor 整段執行
-- ============================================

BEGIN;

CREATE OR REPLACE FUNCTION public.upsert_sync_state(
  p_trip_id text,
  p_trip_secret text,
  p_itinerary jsonb DEFAULT '{}'::jsonb,
  p_budget_limit numeric DEFAULT 100000,
  p_budget_items jsonb DEFAULT '[]'::jsonb,
  p_custom_foods jsonb DEFAULT '[]'::jsonb,
  p_packing_list jsonb DEFAULT '[]'::jsonb,
  p_updated_at timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_existing_secret text;
  v_id text;
  v_updated int;
BEGIN
  IF p_trip_id IS NULL OR length(trim(p_trip_id)) < 8 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_trip_secret IS NULL OR length(trim(p_trip_secret)) < 8 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  p_trip_id := trim(p_trip_id);
  p_trip_secret := trim(p_trip_secret);
  v_id := 'state_' || p_trip_id;

  SELECT s.trip_secret
    INTO v_existing_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;

  IF v_existing_secret IS NOT NULL THEN
    IF v_existing_secret IS DISTINCT FROM p_trip_secret THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    UPDATE public.sync_state
    SET
      itinerary = COALESCE(p_itinerary, itinerary),
      budget_limit = COALESCE(p_budget_limit, budget_limit),
      budget_items = COALESCE(p_budget_items, budget_items),
      custom_foods = COALESCE(p_custom_foods, custom_foods),
      packing_list = COALESCE(p_packing_list, packing_list),
      updated_at = COALESCE(p_updated_at, now()),
      -- 保險：確保 id 一致，避免歷史髒資料
      id = COALESCE(id, v_id)
    WHERE trip_id = p_trip_id
      AND trip_secret = p_trip_secret;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    IF v_updated = 0 THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'update',
      'trip_id', p_trip_id
    );
  END IF;

  INSERT INTO public.sync_state (
    id,
    trip_id,
    trip_secret,
    itinerary,
    budget_limit,
    budget_items,
    custom_foods,
    packing_list,
    updated_at
  ) VALUES (
    v_id,
    p_trip_id,
    p_trip_secret,
    COALESCE(p_itinerary, '{}'::jsonb),
    COALESCE(p_budget_limit, 100000),
    COALESCE(p_budget_items, '[]'::jsonb),
    COALESCE(p_custom_foods, '[]'::jsonb),
    COALESCE(p_packing_list, '[]'::jsonb),
    COALESCE(p_updated_at, now())
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'insert',
    'trip_id', p_trip_id
  );
END;
$$;

ALTER FUNCTION public.upsert_sync_state(
  text, text, jsonb, numeric, jsonb, jsonb, jsonb, timestamptz
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.upsert_sync_state(
  text, text, jsonb, numeric, jsonb, jsonb, jsonb, timestamptz
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_sync_state(
  text, text, jsonb, numeric, jsonb, jsonb, jsonb, timestamptz
) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 驗證：函式應存在且可被 anon 執行
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS args,
  p.prosecdef AS security_definer
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'upsert_sync_state';
