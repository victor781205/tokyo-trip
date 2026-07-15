-- Keep cron retries and manual replays from sending the same reminder twice.
-- Only the server-side service role may read or mutate this delivery ledger.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  trip_id text NOT NULL REFERENCES public.sync_state(trip_id) ON DELETE CASCADE,
  delivery_date date NOT NULL,
  delivery_type text NOT NULL CHECK (
    char_length(delivery_type) BETWEEN 1 AND 64
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (trip_id, delivery_date, delivery_type)
);

ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_delivery_log FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.push_delivery_log
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.push_delivery_log
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
