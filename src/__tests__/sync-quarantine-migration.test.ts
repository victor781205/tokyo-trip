import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve("supabase/migrations/20260714010000_quarantine_invalid_sync_rows.sql"),
  "utf8",
);

describe("invalid sync row quarantine migration", () => {
  it("preserves the complete row before removing unauthenticatable data", () => {
    const insertAt = migration.indexOf("INSERT INTO public.sync_state_quarantine");
    const verifyAt = migration.indexOf("invalid sync row was not preserved");
    const deleteAt = migration.indexOf("DELETE FROM public.sync_state");

    expect(insertAt).toBeGreaterThan(0);
    expect(verifyAt).toBeGreaterThan(insertAt);
    expect(deleteAt).toBeGreaterThan(verifyAt);
    expect(migration).toContain("to_jsonb(s)");
    expect(migration).toContain("q.snapshot = to_jsonb(s)");
    expect(migration).toMatch(/trip_id IS NULL[\s\S]+trip_secret IS NULL/);
  });

  it("keeps quarantine snapshots inaccessible to public roles", () => {
    expect(migration).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(migration).toMatch(/FORCE ROW LEVEL SECURITY/);
    expect(migration).toMatch(
      /REVOKE ALL PRIVILEGES ON TABLE public\.sync_state_quarantine\s+FROM PUBLIC, anon, authenticated/,
    );
    expect(migration).toMatch(/TO service_role\s+USING \(true\)\s+WITH CHECK \(true\)/);
  });
});
