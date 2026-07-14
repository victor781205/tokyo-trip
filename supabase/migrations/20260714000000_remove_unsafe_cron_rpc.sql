-- Remove the cron RPC that accepted both the expected and provided secrets
-- from the caller. Any anon caller could pass the same arbitrary value for
-- both arguments and receive every subscribed trip's secret.
--
-- The Vercel cron route now requires a valid service_role client and reads
-- the already locked tables directly. No public RPC is needed for this flow.

REVOKE ALL ON FUNCTION public.list_push_trips_for_cron(text, text)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION IF EXISTS public.list_push_trips_for_cron(text, text);
