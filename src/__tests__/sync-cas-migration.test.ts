import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260714020000_sync_cas_and_credential_binding.sql"),
  "utf8",
);
const mergeMigration = readFileSync(
  resolve("supabase/migrations/20260714110000_sync_merge_rotation_recovery.sql"),
  "utf8",
);

describe("sync CAS migration security contract", () => {
  it("binds reads to both credentials and removes trip_secret column access", () => {
    expect(migration).toContain("trip_id = public.requesting_trip_id()");
    expect(migration).toContain("trip_secret = public.requesting_trip_secret()");
    expect(migration).toMatch(/REVOKE ALL PRIVILEGES ON TABLE public\.sync_state FROM anon, authenticated/);
    expect(migration).toMatch(/REVOKE SELECT \(trip_secret\)/);

    const clientGrant = migration.match(/GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.sync_state TO anon, authenticated;/)?.[1];
    expect(clientGrant).toBeDefined();
    expect(clientGrant).not.toContain("trip_secret");
  });

  it("uses revision CAS and only a server-issued timestamp", () => {
    const rpcBody = migration.match(/CREATE OR REPLACE FUNCTION public\.sync_trip_slices\(([\s\S]*?)\nEND;\n\$\$;/)?.[0];
    expect(rpcBody).toBeDefined();
    expect(rpcBody).toContain("p_expected_revision bigint");
    expect(rpcBody).toContain("public.requesting_trip_id() IS DISTINCT FROM p_trip_id");
    expect(rpcBody).toContain("public.requesting_trip_secret() IS DISTINCT FROM p_trip_secret");
    expect(rpcBody).toContain("AND revision = p_expected_revision");
    expect(rpcBody).toContain("revision = revision + 1");
    expect(rpcBody).toContain("updated_at = clock_timestamp()");
    expect(rpcBody).not.toContain("p_updated_at");
    expect(migration).toContain("p.proname = 'upsert_sync_state'");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("keeps legacy rows writable but constrains new anonymous rows and payloads", () => {
    const existingBranch = migration.indexOf("IF v_found THEN");
    const newTripFormatCheck = migration.indexOf("new trips require generated high-entropy credentials");
    expect(existingBranch).toBeGreaterThan(0);
    expect(newTripFormatCheck).toBeGreaterThan(existingBranch);
    expect(migration).toContain("^trip_[A-Za-z0-9_-]{22}$");
    expect(migration).toContain("^sec_[A-Za-z0-9_-]{32}$");
    expect(migration).toContain("sync payload too large");
    expect(migration).toContain("jsonb_array_length(p_custom_foods) > 1000");
    expect(migration).toContain("jsonb_array_length(p_budget_items) > 5000");
  });

  it("syncs food statuses through the same revision transaction", () => {
    expect(mergeMigration).toContain("ADD COLUMN IF NOT EXISTS food_statuses jsonb");
    expect(mergeMigration).toContain("CREATE OR REPLACE FUNCTION public.sync_trip_slices_v2");
    expect(mergeMigration).toContain("v_result := public.sync_trip_slices(");
    expect(mergeMigration).toContain("revision = revision + 1");
    expect(mergeMigration).toContain("status_entry.value NOT IN ('wishlist', 'visited')");
  });

  it("revokes old push subscriptions atomically when rotating the secret", () => {
    const rotation = mergeMigration.match(/CREATE OR REPLACE FUNCTION public\.rotate_trip_secret\(([\s\S]*?)\nEND;\n\$\$;/)?.[0];
    expect(rotation).toBeDefined();
    expect(rotation).toContain("SET trip_secret = p_new_secret");
    expect(rotation).toContain("DELETE FROM public.push_subscriptions WHERE trip_id = p_trip_id");
    expect(rotation).toContain("revoked_push_subscriptions");
  });
});
