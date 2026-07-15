-- A device push token represents one active trip at a time. Keep the
-- credential check ahead of every mutation so a rejected caller cannot remove
-- another trip's subscription, then serialize cross-trip moves by token.

BEGIN;

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

  -- A rejected credential has already returned above. This lock makes two
  -- simultaneous attempts to move one device token resolve to one final trip.
  PERFORM pg_advisory_xact_lock(hashtextextended('push-token:' || p_token, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('push:' || p_trip_id, 0));

  DELETE FROM public.push_subscriptions ps
  WHERE ps.token = p_token
    AND ps.trip_id IS DISTINCT FROM p_trip_id;

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

NOTIFY pgrst, 'reload schema';

COMMIT;
