-- ============================================
-- 放寬 trip_id / trip_secret 最小長度限制
-- 日期：2026-07-11
--
-- 背景：
--   系統原本要求 length(trip_id) >= 8 且 length(trip_secret) >= 8，
--   會擋掉使用者自訂短密碼（例如 0505）。
--
-- 變更：
--   改為「trim 後非空即可」（length >= 1）。
--   - 仍強制 secret 必須吻合才能讀寫
--   - 自動產生的 secret 仍維持長字串（前端 generateTripSecret）
--   - 短密碼安全性較弱，屬使用者明確要求的便利性權衡
--
-- 涵蓋：
--   1) sync_state RLS policies
--   2) upsert_sync_state
--   3) rotate_trip_secret
--   4) push 相關 RPC
-- ============================================

BEGIN;

-- 1) helper（保持不變，確保存在）
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

-- 2) 重建 sync_state policies：長度改 >= 1（非空）
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
  END LOOP;
END $$;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;

CREATE POLICY "sync_state_select" ON public.sync_state
  FOR SELECT TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trim(trip_secret)) >= 1
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_insert" ON public.sync_state
  FOR INSERT TO anon, authenticated
  WITH CHECK (
    trip_id IS NOT NULL
    AND trip_secret IS NOT NULL
    AND length(trim(trip_id)) >= 1
    AND length(trim(trip_secret)) >= 1
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_update" ON public.sync_state
  FOR UPDATE TO anon, authenticated
  USING (
    trip_secret IS NOT NULL
    AND length(trim(trip_secret)) >= 1
    AND trip_secret = public.requesting_trip_secret()
  )
  WITH CHECK (
    trip_secret IS NOT NULL
    AND length(trim(trip_secret)) >= 1
    AND length(trim(trip_id)) >= 1
    AND trip_secret = public.requesting_trip_secret()
  );

CREATE POLICY "sync_state_delete" ON public.sync_state
  FOR DELETE TO anon, authenticated
  USING (false);

CREATE POLICY "sync_state_service_all" ON public.sync_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL ON TABLE public.sync_state TO service_role;

-- 3) upsert_sync_state：min length 1
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
  IF p_trip_id IS NULL OR length(trim(p_trip_id)) < 1 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_trip_secret IS NULL OR length(trim(p_trip_secret)) < 1 THEN
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

-- 4) rotate_trip_secret：min length 1
CREATE OR REPLACE FUNCTION public.rotate_trip_secret(
  p_trip_id text,
  p_old_secret text,
  p_new_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET row_security = off
AS $$
DECLARE
  v_updated int;
BEGIN
  IF p_trip_id IS NULL OR length(trim(p_trip_id)) < 1 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_old_secret IS NULL OR length(trim(p_old_secret)) < 1 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_new_secret IS NULL OR length(trim(p_new_secret)) < 1 THEN
    RAISE EXCEPTION 'invalid new secret' USING ERRCODE = '22023';
  END IF;

  p_trip_id := trim(p_trip_id);
  p_old_secret := trim(p_old_secret);
  p_new_secret := trim(p_new_secret);

  IF p_new_secret = p_old_secret THEN
    RETURN jsonb_build_object('ok', true, 'trip_id', p_trip_id, 'unchanged', true);
  END IF;

  UPDATE public.sync_state
  SET trip_secret = p_new_secret,
      updated_at = now()
  WHERE trip_id = p_trip_id
    AND trip_secret = p_old_secret;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'trip_id', p_trip_id,
    'rotated', true
  );
END;
$$;

ALTER FUNCTION public.rotate_trip_secret(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rotate_trip_secret(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rotate_trip_secret(text, text, text) TO anon, authenticated, service_role;

-- 5) push RPCs：secret min length 1；trip_id 非空
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
  IF p_trip_id IS NULL OR length(trim(p_trip_id)) < 1 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_trip_secret IS NULL OR length(trim(p_trip_secret)) < 1 THEN
    RAISE EXCEPTION 'invalid trip_secret' USING ERRCODE = '22023';
  END IF;
  IF p_token IS NULL OR length(p_token) < 1 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;
  IF p_platform IS NULL OR p_platform NOT IN ('web', 'ios', 'android') THEN
    RAISE EXCEPTION 'invalid platform' USING ERRCODE = '22023';
  END IF;

  p_trip_id := trim(p_trip_id);
  p_trip_secret := trim(p_trip_secret);

  SELECT trip_secret INTO v_existing_secret
  FROM public.sync_state
  WHERE trip_id = p_trip_id
  LIMIT 1;

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
  IF p_trip_id IS NULL OR p_trip_secret IS NULL OR length(trim(p_trip_secret)) < 1 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  p_trip_id := trim(p_trip_id);
  p_trip_secret := trim(p_trip_secret);

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
  IF p_trip_id IS NULL OR p_trip_secret IS NULL OR length(trim(p_trip_secret)) < 1 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  p_trip_id := trim(p_trip_id);
  p_trip_secret := trim(p_trip_secret);

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

NOTIFY pgrst, 'reload schema';

COMMIT;
