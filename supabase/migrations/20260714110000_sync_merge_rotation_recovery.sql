-- Entity-aware client merge support, synced food statuses, and atomic push
-- revocation during secret rotation. Safe to re-run on an already migrated DB.

BEGIN;

ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS food_statuses jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.sync_state
SET food_statuses = '{}'::jsonb
WHERE food_statuses IS NULL OR jsonb_typeof(food_statuses) IS DISTINCT FROM 'object';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sync_state'::regclass
      AND conname = 'sync_state_food_statuses_object'
  ) THEN
    ALTER TABLE public.sync_state
      ADD CONSTRAINT sync_state_food_statuses_object
      CHECK (jsonb_typeof(food_statuses) = 'object');
  END IF;
END;
$$;

GRANT SELECT (food_statuses) ON TABLE public.sync_state TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.sync_trip_slices_v2(
  p_trip_id text,
  p_trip_secret text,
  p_expected_revision bigint,
  p_dirty_slices text[] DEFAULT '{}'::text[],
  p_itinerary jsonb DEFAULT NULL,
  p_budget_limit numeric DEFAULT NULL,
  p_budget_items jsonb DEFAULT NULL,
  p_custom_foods jsonb DEFAULT NULL,
  p_packing_list jsonb DEFAULT NULL,
  p_food_statuses jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_slices text[];
  v_legacy_slices text[];
  v_result jsonb;
  v_revision bigint;
  v_updated_at timestamptz;
BEGIN
  SELECT COALESCE(array_agg(DISTINCT slice ORDER BY slice), '{}'::text[])
    INTO v_slices
  FROM unnest(COALESCE(p_dirty_slices, '{}'::text[])) AS slice;

  IF cardinality(v_slices) > 6 OR EXISTS (
    SELECT 1 FROM unnest(v_slices) AS slice
    WHERE slice NOT IN (
      'itinerary', 'budgetLimit', 'budgetItems', 'customFoods',
      'packingList', 'foodStatuses'
    )
  ) THEN
    RAISE EXCEPTION 'invalid dirty slices' USING ERRCODE = '22023';
  END IF;

  IF 'foodStatuses' = ANY(v_slices) THEN
    IF p_food_statuses IS NULL OR jsonb_typeof(p_food_statuses) <> 'object' THEN
      RAISE EXCEPTION 'invalid food statuses payload' USING ERRCODE = '22023';
    END IF;
    IF octet_length(p_food_statuses::text) > 262144
       OR (SELECT count(*) FROM jsonb_object_keys(p_food_statuses)) > 2000
       OR EXISTS (
         SELECT 1 FROM jsonb_each_text(p_food_statuses) AS status_entry
         WHERE length(status_entry.key) NOT BETWEEN 1 AND 200
            OR status_entry.value NOT IN ('wishlist', 'visited')
       ) THEN
      RAISE EXCEPTION 'invalid food statuses payload' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT COALESCE(array_agg(slice ORDER BY slice), '{}'::text[])
    INTO v_legacy_slices
  FROM unnest(v_slices) AS slice
  WHERE slice <> 'foodStatuses';

  -- The established function performs credential binding, payload validation,
  -- row creation, locking, and revision CAS. This wrapper remains one database
  -- transaction, so food statuses cannot be partially committed.
  v_result := public.sync_trip_slices(
    p_trip_id,
    p_trip_secret,
    p_expected_revision,
    v_legacy_slices,
    p_itinerary,
    p_budget_limit,
    p_budget_items,
    p_custom_foods,
    p_packing_list
  );

  IF COALESCE((v_result->>'conflict')::boolean, false) THEN
    RETURN v_result;
  END IF;

  IF 'foodStatuses' = ANY(v_slices) THEN
    v_revision := (v_result->>'revision')::bigint;
    IF v_result->>'action' = 'noop' THEN
      UPDATE public.sync_state
      SET food_statuses = p_food_statuses,
          revision = revision + 1,
          updated_at = clock_timestamp()
      WHERE trip_id = trim(p_trip_id)
        AND trip_secret = trim(p_trip_secret)
        AND revision = v_revision
      RETURNING revision, updated_at INTO v_revision, v_updated_at;
    ELSE
      UPDATE public.sync_state
      SET food_statuses = p_food_statuses,
          updated_at = clock_timestamp()
      WHERE trip_id = trim(p_trip_id)
        AND trip_secret = trim(p_trip_secret)
        AND revision = v_revision
      RETURNING revision, updated_at INTO v_revision, v_updated_at;
    END IF;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'concurrent update invariant failed' USING ERRCODE = '40001';
    END IF;

    v_result := v_result
      || jsonb_build_object(
        'ok', true,
        'action', CASE
          WHEN v_result->>'action' = 'insert' THEN 'insert'
          ELSE 'update'
        END,
        'revision', v_revision,
        'updated_at', v_updated_at
      );
  END IF;

  RETURN v_result;
END;
$$;

ALTER FUNCTION public.sync_trip_slices_v2(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_trip_slices_v2(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_trip_slices_v2(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb, jsonb
) TO anon, authenticated, service_role;

-- A rotated credential is a new trust boundary. Revoke every token for the old
-- trust set in the same transaction; the current device may idempotently
-- subscribe again with the new secret.
CREATE OR REPLACE FUNCTION public.rotate_trip_secret(
  p_trip_id text,
  p_old_secret text,
  p_new_secret text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_revision bigint;
  v_updated_at timestamptz;
  v_revoked integer;
BEGIN
  p_trip_id := trim(COALESCE(p_trip_id, ''));
  p_old_secret := trim(COALESCE(p_old_secret, ''));
  p_new_secret := trim(COALESCE(p_new_secret, ''));
  IF length(p_trip_id) < 1 OR length(p_old_secret) < 1 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF public.requesting_trip_id() IS DISTINCT FROM p_trip_id
     OR public.requesting_trip_secret() IS DISTINCT FROM p_old_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_new_secret !~ '^sec_[A-Za-z0-9_-]{32}$' THEN
    RAISE EXCEPTION 'invalid new secret' USING ERRCODE = '22023';
  END IF;

  UPDATE public.sync_state
  SET trip_secret = p_new_secret,
      revision = revision + 1,
      updated_at = clock_timestamp()
  WHERE trip_id = p_trip_id
    AND trip_secret = p_old_secret
  RETURNING revision, updated_at INTO v_revision, v_updated_at;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.push_subscriptions WHERE trip_id = p_trip_id;
  GET DIAGNOSTICS v_revoked = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'trip_id', p_trip_id,
    'rotated', true,
    'revision', v_revision,
    'updated_at', v_updated_at,
    'revoked_push_subscriptions', v_revoked
  );
END;
$$;

ALTER FUNCTION public.rotate_trip_secret(text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rotate_trip_secret(text, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rotate_trip_secret(text, text, text)
  TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
