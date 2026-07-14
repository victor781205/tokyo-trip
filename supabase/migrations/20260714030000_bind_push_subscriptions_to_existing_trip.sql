-- Bind every push token to a real, credential-matched trip and bound the
-- SECURITY DEFINER surface exposed to anonymous clients.

BEGIN;

DO $$
DECLARE
  v_missing text[];
BEGIN
  IF to_regclass('public.sync_state') IS NULL
     OR to_regclass('public.push_subscriptions') IS NULL THEN
    RAISE EXCEPTION 'required sync_state/push_subscriptions tables do not exist';
  END IF;

  SELECT array_agg(required_column ORDER BY required_column)
    INTO v_missing
  FROM unnest(ARRAY['id', 'trip_id', 'token', 'platform', 'keys', 'updated_at'])
    AS required_column
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.push_subscriptions'::regclass
      AND a.attname = required_column
      AND a.attnum > 0
      AND NOT a.attisdropped
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'public.push_subscriptions is missing required columns: %', v_missing;
  END IF;
END;
$$;

-- Remove rows the former RPC could create before a corresponding trip existed.
DELETE FROM public.push_subscriptions ps
WHERE NOT EXISTS (
  SELECT 1 FROM public.sync_state s WHERE s.trip_id = ps.trip_id
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.push_subscriptions'::regclass
      AND conname = 'push_subscriptions_trip_id_fkey'
  ) THEN
    ALTER TABLE public.push_subscriptions
      ADD CONSTRAINT push_subscriptions_trip_id_fkey
      FOREIGN KEY (trip_id)
      REFERENCES public.sync_state(trip_id)
      ON DELETE CASCADE;
  END IF;
END;
$$;

REVOKE ALL PRIVILEGES ON TABLE public.push_subscriptions
  FROM PUBLIC, anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.push_subscriptions TO service_role;

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
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_existing_secret text;
  v_id uuid;
BEGIN
  p_trip_id := trim(COALESCE(p_trip_id, ''));
  p_trip_secret := trim(COALESCE(p_trip_secret, ''));
  p_token := trim(COALESCE(p_token, ''));
  p_platform := trim(COALESCE(p_platform, ''));

  IF length(p_trip_id) < 1 OR octet_length(p_trip_id) > 64 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF length(p_trip_secret) < 1 OR octet_length(p_trip_secret) > 128 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF length(p_token) < 1 OR octet_length(p_token) > 2048 THEN
    RAISE EXCEPTION 'invalid token' USING ERRCODE = '22023';
  END IF;
  IF p_platform NOT IN ('web', 'ios', 'android') THEN
    RAISE EXCEPTION 'invalid platform' USING ERRCODE = '22023';
  END IF;
  IF octet_length(COALESCE(p_keys, 'null'::jsonb)::text) > 4096 THEN
    RAISE EXCEPTION 'push keys payload too large' USING ERRCODE = '22023';
  END IF;

  IF p_platform = 'web' THEN
    IF p_token !~ '^https://'
       OR p_keys IS NULL
       OR jsonb_typeof(p_keys) <> 'object'
       OR length(COALESCE(p_keys->>'p256dh', '')) NOT BETWEEN 16 AND 512
       OR length(COALESCE(p_keys->>'auth', '')) NOT BETWEEN 8 AND 256 THEN
      RAISE EXCEPTION 'invalid web push subscription' USING ERRCODE = '22023';
    END IF;
  ELSE
    p_keys := NULL;
  END IF;

  SELECT s.trip_secret
    INTO v_existing_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;

  IF NOT FOUND OR v_existing_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('push:' || p_trip_id, 0));
  IF NOT EXISTS (
    SELECT 1
    FROM public.push_subscriptions ps
    WHERE ps.trip_id = p_trip_id AND ps.token = p_token
  ) AND (
    SELECT count(*) FROM public.push_subscriptions ps WHERE ps.trip_id = p_trip_id
  ) >= 64 THEN
    RAISE EXCEPTION 'push subscription limit reached' USING ERRCODE = '54000';
  END IF;

  INSERT INTO public.push_subscriptions AS ps (
    trip_id, token, platform, keys, updated_at
  ) VALUES (
    p_trip_id, p_token, p_platform, p_keys, clock_timestamp()
  )
  ON CONFLICT (trip_id, token) DO UPDATE
    SET platform = EXCLUDED.platform,
        keys = EXCLUDED.keys,
        updated_at = clock_timestamp()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

ALTER FUNCTION public.upsert_push_subscription(text, text, text, text, jsonb)
  OWNER TO postgres;
REVOKE ALL ON FUNCTION public.upsert_push_subscription(text, text, text, text, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.upsert_push_subscription(text, text, text, text, jsonb)
  TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_push_subscriptions(
  p_trip_id text,
  p_trip_secret text
)
RETURNS TABLE (token text, platform text, keys jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_secret text;
BEGIN
  p_trip_id := trim(COALESCE(p_trip_id, ''));
  p_trip_secret := trim(COALESCE(p_trip_secret, ''));
  IF length(p_trip_id) < 1 OR octet_length(p_trip_id) > 64
     OR length(p_trip_secret) < 1 OR octet_length(p_trip_secret) > 128 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT s.trip_secret INTO v_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;
  IF NOT FOUND OR v_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT ps.token, ps.platform, ps.keys
  FROM public.push_subscriptions ps
  WHERE ps.trip_id = p_trip_id
  ORDER BY ps.updated_at DESC
  LIMIT 64;
END;
$$;

ALTER FUNCTION public.list_push_subscriptions(text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.list_push_subscriptions(text, text)
  FROM PUBLIC, anon, authenticated, service_role;
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
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_secret text;
  v_count integer;
BEGIN
  p_trip_id := trim(COALESCE(p_trip_id, ''));
  p_trip_secret := trim(COALESCE(p_trip_secret, ''));
  IF length(p_trip_id) < 1 OR octet_length(p_trip_id) > 64
     OR length(p_trip_secret) < 1 OR octet_length(p_trip_secret) > 128 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_tokens IS NULL OR cardinality(p_tokens) NOT BETWEEN 1 AND 64
     OR EXISTS (
       SELECT 1 FROM unnest(p_tokens) AS token
       WHERE length(trim(COALESCE(token, ''))) < 1 OR octet_length(token) > 2048
     ) THEN
    RAISE EXCEPTION 'invalid push tokens' USING ERRCODE = '22023';
  END IF;

  SELECT s.trip_secret INTO v_secret
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  LIMIT 1;
  IF NOT FOUND OR v_secret IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_subscriptions ps
  WHERE ps.trip_id = p_trip_id
    AND ps.token = ANY(p_tokens);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;

ALTER FUNCTION public.delete_push_tokens(text, text, text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.delete_push_tokens(text, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_push_tokens(text, text, text[])
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
