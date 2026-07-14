-- Preserve legacy rows that can never be authenticated before enforcing the
-- credential and uniqueness invariants required by revision CAS.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.sync_state') IS NULL THEN
    RAISE EXCEPTION 'required table public.sync_state does not exist';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.sync_state_quarantine (
  source_id text PRIMARY KEY,
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 64),
  snapshot jsonb NOT NULL,
  original_updated_at timestamptz,
  quarantined_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

INSERT INTO public.sync_state_quarantine AS quarantine (
  source_id,
  reason,
  snapshot,
  original_updated_at,
  quarantined_at
)
SELECT
  COALESCE(
    NULLIF(trim(s.id::text), ''),
    'missing-id:' || md5(to_jsonb(s)::text)
  ),
  'blank-credentials',
  to_jsonb(s),
  s.updated_at,
  clock_timestamp()
FROM public.sync_state s
WHERE s.trip_id IS NULL
   OR length(trim(s.trip_id)) < 1
   OR s.trip_secret IS NULL
   OR length(trim(s.trip_secret)) < 1
ON CONFLICT (source_id) DO UPDATE
SET reason = EXCLUDED.reason,
    snapshot = EXCLUDED.snapshot,
    original_updated_at = EXCLUDED.original_updated_at,
    quarantined_at = EXCLUDED.quarantined_at;

-- Never delete an invalid row unless its complete snapshot is present in the
-- locked quarantine table in the same transaction.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.sync_state s
    WHERE (
      s.trip_id IS NULL
      OR length(trim(s.trip_id)) < 1
      OR s.trip_secret IS NULL
      OR length(trim(s.trip_secret)) < 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.sync_state_quarantine q
      WHERE q.source_id = COALESCE(
        NULLIF(trim(s.id::text), ''),
        'missing-id:' || md5(to_jsonb(s)::text)
      )
        AND q.snapshot = to_jsonb(s)
    )
  ) THEN
    RAISE EXCEPTION 'invalid sync row was not preserved; refusing cleanup';
  END IF;
END;
$$;

DELETE FROM public.sync_state s
WHERE s.trip_id IS NULL
   OR length(trim(s.trip_id)) < 1
   OR s.trip_secret IS NULL
   OR length(trim(s.trip_secret)) < 1;

ALTER TABLE public.sync_state_quarantine ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_state_quarantine FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sync_state_quarantine_service_all
  ON public.sync_state_quarantine;
CREATE POLICY sync_state_quarantine_service_all
  ON public.sync_state_quarantine
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL PRIVILEGES ON TABLE public.sync_state_quarantine
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, DELETE ON TABLE public.sync_state_quarantine TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
