-- Atomic, slice-scoped trip sync with credential-bound reads.
--
-- Security invariants after this migration:
--   * anon/authenticated may SELECT only non-secret columns and only when both
--     x-trip-id and x-trip-secret match the row.
--   * anon/authenticated cannot write sync_state directly or call the legacy
--     caller-timestamp/full-snapshot RPC.
--   * all client writes use a server-revision CAS RPC. updated_at is issued by
--     PostgreSQL and never accepted from the caller.
--   * existing rows keep working with legacy short credentials; only creation
--     of a new row requires the current high-entropy generated formats.

BEGIN;

DO $$
DECLARE
  v_missing text[];
BEGIN
  IF to_regclass('public.sync_state') IS NULL THEN
    RAISE EXCEPTION 'required table public.sync_state does not exist';
  END IF;

  SELECT array_agg(required_column ORDER BY required_column)
    INTO v_missing
  FROM unnest(ARRAY[
    'id',
    'trip_id',
    'trip_secret',
    'itinerary',
    'budget_limit',
    'budget_items',
    'custom_foods',
    'packing_list',
    'updated_at'
  ]) AS required_column
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_attribute a
    WHERE a.attrelid = 'public.sync_state'::regclass
      AND a.attname = required_column
      AND a.attnum > 0
      AND NOT a.attisdropped
  );

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'public.sync_state is missing required columns: %', v_missing;
  END IF;
END;
$$;

ALTER TABLE public.sync_state
  ADD COLUMN IF NOT EXISTS revision bigint;

DO $$
BEGIN
  IF (
    SELECT format_type(a.atttypid, a.atttypmod)
    FROM pg_attribute a
    WHERE a.attrelid = 'public.sync_state'::regclass
      AND a.attname = 'revision'
      AND a.attnum > 0
      AND NOT a.attisdropped
  ) <> 'bigint' THEN
    RAISE EXCEPTION 'public.sync_state.revision must be bigint';
  END IF;
END;
$$;

UPDATE public.sync_state SET revision = 0 WHERE revision IS NULL;
ALTER TABLE public.sync_state ALTER COLUMN revision SET DEFAULT 0;
ALTER TABLE public.sync_state ALTER COLUMN revision SET NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sync_state
    WHERE trip_id IS NULL
       OR length(trim(trip_id)) < 1
       OR trip_secret IS NULL
       OR length(trim(trip_secret)) < 1
  ) THEN
    RAISE EXCEPTION 'public.sync_state contains blank trip credentials; refusing unsafe CAS migration';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.sync_state
    GROUP BY trip_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'public.sync_state contains duplicate trip_id rows; refusing unsafe CAS migration';
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS sync_state_trip_id_unique
  ON public.sync_state (trip_id);

ALTER TABLE public.sync_state ALTER COLUMN trip_id SET NOT NULL;
ALTER TABLE public.sync_state ALTER COLUMN trip_secret SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sync_state'::regclass
      AND conname = 'sync_state_trip_id_nonblank'
  ) THEN
    ALTER TABLE public.sync_state
      ADD CONSTRAINT sync_state_trip_id_nonblank CHECK (length(trim(trip_id)) >= 1);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.sync_state'::regclass
      AND conname = 'sync_state_trip_secret_nonblank'
  ) THEN
    ALTER TABLE public.sync_state
      ADD CONSTRAINT sync_state_trip_secret_nonblank CHECK (length(trim(trip_secret)) >= 1);
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index i
    JOIN pg_class index_class ON index_class.oid = i.indexrelid
    JOIN pg_attribute indexed_column
      ON indexed_column.attrelid = i.indrelid
     AND indexed_column.attnum = i.indkey[0]
    WHERE i.indrelid = 'public.sync_state'::regclass
      AND index_class.relname = 'sync_state_trip_id_unique'
      AND i.indisunique
      AND i.indisvalid
      AND i.indnkeyatts = 1
      AND i.indpred IS NULL
      AND i.indexprs IS NULL
      AND indexed_column.attname = 'trip_id'
  ) THEN
    RAISE EXCEPTION 'sync_state_trip_id_unique exists with an unsafe definition';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.sync_state'::regclass
      AND conname = 'sync_state_revision_nonnegative'
  ) THEN
    ALTER TABLE public.sync_state
      ADD CONSTRAINT sync_state_revision_nonnegative CHECK (revision >= 0);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.requesting_trip_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    trim(COALESCE(
      current_setting('request.headers', true)::json->>'x-trip-id',
      current_setting('request.headers', true)::json->>'X-Trip-Id',
      ''
    )),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.requesting_trip_secret()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(
    trim(COALESCE(
      current_setting('request.headers', true)::json->>'x-trip-secret',
      current_setting('request.headers', true)::json->>'X-Trip-Secret',
      ''
    )),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.requesting_trip_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.requesting_trip_secret() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.requesting_trip_id() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.requesting_trip_secret() TO anon, authenticated, service_role;

-- Remove every historical permissive policy rather than relying on its name.
DO $$
DECLARE
  v_policy record;
BEGIN
  FOR v_policy IN
    SELECT p.polname
    FROM pg_policy p
    WHERE p.polrelid = 'public.sync_state'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.sync_state', v_policy.polname);
  END LOOP;
END;
$$;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_state_select_bound_credentials ON public.sync_state
  FOR SELECT
  TO anon, authenticated
  USING (
    trip_id = public.requesting_trip_id()
    AND trip_secret = public.requesting_trip_secret()
    AND length(trim(trip_id)) >= 1
    AND length(trim(trip_secret)) >= 1
  );

CREATE POLICY sync_state_service_all ON public.sync_state
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Table-level SELECT would expose trip_secret even with RLS. Grant only the
-- DTO columns used by clients, and force all writes through the CAS function.
REVOKE ALL PRIVILEGES ON TABLE public.sync_state FROM anon, authenticated;
REVOKE SELECT (trip_secret) ON TABLE public.sync_state FROM anon, authenticated;
GRANT SELECT (
  trip_id,
  itinerary,
  budget_limit,
  budget_items,
  custom_foods,
  packing_list,
  updated_at,
  revision
) ON TABLE public.sync_state TO anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.sync_state TO service_role;

-- Disable the old API if it exists. It accepted caller-controlled timestamps
-- and replaced the entire snapshot, so leaving it callable would bypass CAS.
DO $$
DECLARE
  v_legacy regprocedure;
BEGIN
  FOR v_legacy IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'upsert_sync_state'
  LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION ' || v_legacy::text ||
      ' FROM PUBLIC, anon, authenticated, service_role';
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_trip_slices(
  p_trip_id text,
  p_trip_secret text,
  p_expected_revision bigint,
  p_dirty_slices text[] DEFAULT '{}'::text[],
  p_itinerary jsonb DEFAULT NULL,
  p_budget_limit numeric DEFAULT NULL,
  p_budget_items jsonb DEFAULT NULL,
  p_custom_foods jsonb DEFAULT NULL,
  p_packing_list jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET row_security = off
AS $$
DECLARE
  v_slices text[];
  v_existing_secret text;
  v_revision bigint;
  v_updated_at timestamptz;
  v_found boolean;
  v_payload_bytes bigint;
BEGIN
  p_trip_id := trim(COALESCE(p_trip_id, ''));
  p_trip_secret := trim(COALESCE(p_trip_secret, ''));

  IF length(p_trip_id) < 1 OR octet_length(p_trip_id) > 64 THEN
    RAISE EXCEPTION 'invalid trip_id' USING ERRCODE = '22023';
  END IF;
  IF length(p_trip_secret) < 1 OR octet_length(p_trip_secret) > 128 THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
    RAISE EXCEPTION 'invalid expected revision' USING ERRCODE = '22023';
  END IF;
  IF public.requesting_trip_id() IS DISTINCT FROM p_trip_id
     OR public.requesting_trip_secret() IS DISTINCT FROM p_trip_secret THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(array_agg(DISTINCT slice ORDER BY slice), '{}'::text[])
    INTO v_slices
  FROM unnest(COALESCE(p_dirty_slices, '{}'::text[])) AS slice;

  IF cardinality(v_slices) > 5 OR EXISTS (
    SELECT 1
    FROM unnest(v_slices) AS slice
    WHERE slice NOT IN ('itinerary', 'budgetLimit', 'budgetItems', 'customFoods', 'packingList')
  ) THEN
    RAISE EXCEPTION 'invalid dirty slices' USING ERRCODE = '22023';
  END IF;

  v_payload_bytes :=
    octet_length(COALESCE(p_itinerary, 'null'::jsonb)::text)
    + octet_length(COALESCE(p_budget_limit::text, 'null'))
    + octet_length(COALESCE(p_budget_items, 'null'::jsonb)::text)
    + octet_length(COALESCE(p_custom_foods, 'null'::jsonb)::text)
    + octet_length(COALESCE(p_packing_list, 'null'::jsonb)::text);
  IF v_payload_bytes > 786432 THEN
    RAISE EXCEPTION 'sync payload too large' USING ERRCODE = '22023';
  END IF;

  IF 'itinerary' = ANY(v_slices) THEN
    IF p_itinerary IS NULL OR jsonb_typeof(p_itinerary) <> 'object' THEN
      RAISE EXCEPTION 'invalid itinerary payload' USING ERRCODE = '22023';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(p_itinerary)) > 64 THEN
      RAISE EXCEPTION 'itinerary has too many days' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_each(p_itinerary) AS day_entry
      WHERE jsonb_typeof(day_entry.value) <> 'object'
         OR jsonb_typeof(day_entry.value->'activities') <> 'array'
    ) THEN
      RAISE EXCEPTION 'invalid itinerary day payload' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
      SELECT 1
      FROM jsonb_each(p_itinerary) AS day_entry
      WHERE jsonb_array_length(day_entry.value->'activities') > 500
    ) THEN
      RAISE EXCEPTION 'itinerary day has too many activities' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF 'budgetLimit' = ANY(v_slices)
     AND (p_budget_limit IS NULL OR p_budget_limit < 0 OR p_budget_limit > 1000000000) THEN
    RAISE EXCEPTION 'invalid budget limit' USING ERRCODE = '22023';
  END IF;
  IF 'budgetItems' = ANY(v_slices) THEN
    IF p_budget_items IS NULL OR jsonb_typeof(p_budget_items) <> 'array' THEN
      RAISE EXCEPTION 'invalid budget items payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_budget_items) > 5000 THEN
      RAISE EXCEPTION 'too many budget items' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF 'customFoods' = ANY(v_slices) THEN
    IF p_custom_foods IS NULL OR jsonb_typeof(p_custom_foods) <> 'array' THEN
      RAISE EXCEPTION 'invalid custom foods payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_custom_foods) > 1000 THEN
      RAISE EXCEPTION 'too many custom foods' USING ERRCODE = '22023';
    END IF;
  END IF;
  IF 'packingList' = ANY(v_slices) THEN
    IF p_packing_list IS NULL OR jsonb_typeof(p_packing_list) <> 'array' THEN
      RAISE EXCEPTION 'invalid packing list payload' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_packing_list) > 5000 THEN
      RAISE EXCEPTION 'too many packing items' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- Serialize creation of the same trip id before deciding insert vs update.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_trip_id, 0));

  SELECT s.trip_secret, s.revision
    INTO v_existing_secret, v_revision
  FROM public.sync_state s
  WHERE s.trip_id = p_trip_id
  FOR UPDATE;
  v_found := FOUND;

  IF v_found THEN
    IF v_existing_secret IS DISTINCT FROM p_trip_secret THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF v_revision IS DISTINCT FROM p_expected_revision THEN
      RETURN jsonb_build_object(
        'ok', false,
        'conflict', true,
        'revision', v_revision
      );
    END IF;

    IF cardinality(v_slices) = 0 THEN
      SELECT s.updated_at INTO v_updated_at
      FROM public.sync_state s
      WHERE s.trip_id = p_trip_id;
      RETURN jsonb_build_object(
        'ok', true,
        'action', 'noop',
        'revision', v_revision,
        'updated_at', v_updated_at
      );
    END IF;

    UPDATE public.sync_state
    SET itinerary = CASE WHEN 'itinerary' = ANY(v_slices) THEN p_itinerary ELSE itinerary END,
        budget_limit = CASE WHEN 'budgetLimit' = ANY(v_slices) THEN p_budget_limit ELSE budget_limit END,
        budget_items = CASE WHEN 'budgetItems' = ANY(v_slices) THEN p_budget_items ELSE budget_items END,
        custom_foods = CASE WHEN 'customFoods' = ANY(v_slices) THEN p_custom_foods ELSE custom_foods END,
        packing_list = CASE WHEN 'packingList' = ANY(v_slices) THEN p_packing_list ELSE packing_list END,
        revision = revision + 1,
        updated_at = clock_timestamp()
    WHERE trip_id = p_trip_id
      AND trip_secret = p_trip_secret
      AND revision = p_expected_revision
    RETURNING revision, updated_at INTO v_revision, v_updated_at;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'concurrent update invariant failed' USING ERRCODE = '40001';
    END IF;

    RETURN jsonb_build_object(
      'ok', true,
      'action', 'update',
      'revision', v_revision,
      'updated_at', v_updated_at
    );
  END IF;

  -- Existing legacy IDs/secrets remain valid above. Only anonymous creation is
  -- restricted to the exact formats emitted by generateTripId/Secret.
  IF p_expected_revision <> 0 THEN
    RETURN jsonb_build_object('ok', false, 'conflict', true, 'revision', 0);
  END IF;
  IF p_trip_id !~ '^trip_[A-Za-z0-9_-]{22}$'
     OR p_trip_secret !~ '^sec_[A-Za-z0-9_-]{32}$' THEN
    RAISE EXCEPTION 'new trips require generated high-entropy credentials'
      USING ERRCODE = '22023';
  END IF;

  v_revision := 1;
  v_updated_at := clock_timestamp();
  INSERT INTO public.sync_state (
    id,
    trip_id,
    trip_secret,
    itinerary,
    budget_limit,
    budget_items,
    custom_foods,
    packing_list,
    revision,
    updated_at
  ) VALUES (
    'state_' || p_trip_id,
    p_trip_id,
    p_trip_secret,
    CASE WHEN 'itinerary' = ANY(v_slices) THEN p_itinerary ELSE '{}'::jsonb END,
    CASE WHEN 'budgetLimit' = ANY(v_slices) THEN p_budget_limit ELSE 100000 END,
    CASE WHEN 'budgetItems' = ANY(v_slices) THEN p_budget_items ELSE '[]'::jsonb END,
    CASE WHEN 'customFoods' = ANY(v_slices) THEN p_custom_foods ELSE '[]'::jsonb END,
    CASE WHEN 'packingList' = ANY(v_slices) THEN p_packing_list ELSE '[]'::jsonb END,
    v_revision,
    v_updated_at
  );

  RETURN jsonb_build_object(
    'ok', true,
    'action', 'insert',
    'revision', v_revision,
    'updated_at', v_updated_at
  );
END;
$$;

ALTER FUNCTION public.sync_trip_slices(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.sync_trip_slices(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.sync_trip_slices(
  text, text, bigint, text[], jsonb, numeric, jsonb, jsonb, jsonb
) TO anon, authenticated, service_role;

-- Rotation participates in the same revision stream and only permits a newly
-- generated high-entropy secret. The old secret may remain a legacy short one.
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

  RETURN jsonb_build_object(
    'ok', true,
    'trip_id', p_trip_id,
    'rotated', true,
    'revision', v_revision,
    'updated_at', v_updated_at
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
