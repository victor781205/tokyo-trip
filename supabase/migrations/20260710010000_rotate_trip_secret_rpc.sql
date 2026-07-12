-- ============================================
-- 以 SECURITY DEFINER RPC 安全輪換 trip_secret
-- 日期：2026-07-10
--
-- 背景：
--   直接 UPDATE trip_secret 在 FORCE RLS 環境下，
--   即使 WITH CHECK 已放寬，PostgREST 仍可能回 42501。
--   改走 SECURITY DEFINER + row_security=off RPC：
--   - 必須提供正確 old secret
--   - 不暴露任意寫入
-- ============================================

BEGIN;

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
  IF p_trip_id IS NULL OR length(p_trip_id) < 8 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF p_old_secret IS NULL OR length(p_old_secret) < 8 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_new_secret IS NULL OR length(p_new_secret) < 8 THEN
    RAISE EXCEPTION 'invalid new secret' USING ERRCODE = '22023';
  END IF;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
