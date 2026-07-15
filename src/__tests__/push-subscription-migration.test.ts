// @vitest-environment node

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260715000000_single_active_trip_per_push_token.sql",
  ),
  "utf8",
);

function position(pattern: RegExp): number {
  const match = pattern.exec(migration);
  expect(match, `Missing migration contract: ${pattern}`).not.toBeNull();
  return match!.index;
}

describe("single-active-trip push subscription migration", () => {
  it("authenticates the target trip before deleting any existing token binding", () => {
    const credentialLookup = position(
      /SELECT\s+s\.trip_secret[\s\S]*?WHERE\s+s\.trip_id\s*=\s*p_trip_id/i,
    );
    const credentialGuard = position(
      /IF\s+NOT\s+FOUND\s+OR\s+v_existing_secret\s+IS\s+DISTINCT\s+FROM\s+p_trip_secret[\s\S]*?RAISE\s+EXCEPTION\s+'forbidden'/i,
    );
    const crossTripDelete = position(
      /DELETE\s+FROM\s+public\.push_subscriptions\s+ps\s+WHERE\s+ps\.token\s*=\s*p_token\s+AND\s+ps\.trip_id\s+IS\s+DISTINCT\s+FROM\s+p_trip_id/i,
    );
    const upsert = position(/INSERT\s+INTO\s+public\.push_subscriptions\s+AS\s+ps/i);

    expect(credentialLookup).toBeLessThan(credentialGuard);
    expect(credentialGuard).toBeLessThan(crossTripDelete);
    expect(crossTripDelete).toBeLessThan(upsert);
  });

  it("serializes token moves and retains the bounded SECURITY DEFINER contract", () => {
    expect(migration).toMatch(
      /pg_advisory_xact_lock\s*\(\s*hashtextextended\s*\(\s*'push-token:'\s*\|\|\s*p_token/i,
    );
    expect(migration).toMatch(/LANGUAGE\s+plpgsql\s+SECURITY\s+DEFINER/i);
    expect(migration).toMatch(/SET\s+search_path\s*=\s*public,\s*pg_temp/i);
    expect(migration).toMatch(/SET\s+row_security\s*=\s*off/i);
    expect(migration).toMatch(/octet_length\(p_trip_id\)\s*>\s*64/i);
    expect(migration).toMatch(/octet_length\(p_trip_secret\)\s*>\s*128/i);
    expect(migration).toMatch(/octet_length\(p_token\)\s*>\s*2048/i);
    expect(migration).toMatch(/push keys payload too large/i);
    expect(migration).toMatch(/invalid web push subscription/i);
    expect(migration).toMatch(/push subscription limit reached/i);
    expect(migration).toMatch(
      /ALTER\s+FUNCTION\s+public\.upsert_push_subscription\(text,\s*text,\s*text,\s*text,\s*jsonb\)\s+OWNER\s+TO\s+postgres/i,
    );
    expect(migration).toMatch(
      /REVOKE\s+ALL\s+ON\s+FUNCTION\s+public\.upsert_push_subscription[\s\S]*?FROM\s+PUBLIC,\s*anon,\s*authenticated,\s*service_role/i,
    );
    expect(migration).toMatch(
      /GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+public\.upsert_push_subscription[\s\S]*?TO\s+anon,\s*authenticated,\s*service_role/i,
    );
  });
});
