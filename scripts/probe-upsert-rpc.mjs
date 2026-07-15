/**
 * Probe whether upsert_sync_state exists using only public anon key.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";

function loadEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v.trim()) out[m[1]] = v.trim();
  }
  return out;
}

const env = { ...loadEnv(".env.smoke.runtime"), ...process.env };
const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
console.log("URL", URL);
console.log("ANON", ANON ? `len=${ANON.length}` : "MISSING");

const c = createClient(URL, ANON, {
  global: { headers: { "x-trip-secret": "sec_probe_function_exists_xx" } },
  auth: { persistSession: false, autoRefreshToken: false },
});

const r = await c.rpc("upsert_sync_state", {
  p_trip_id: "trip_probe_exists_xx",
  p_trip_secret: "sec_probe_function_exists_xx",
  p_itinerary: {},
  p_budget_limit: 1,
  p_budget_items: [],
  p_custom_foods: [],
  p_packing_list: [],
  p_updated_at: new Date().toISOString(),
});
console.log("rpc result", { data: r.data, error: r.error?.message, code: r.error?.code, details: r.error?.details, hint: r.error?.hint });

const h = await c.rpc("requesting_trip_secret");
console.log("requesting_trip_secret", { data: h.data, error: h.error?.message });
