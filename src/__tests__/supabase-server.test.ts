import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerSupabase } from "@/lib/supabase-server";

function legacyJwt(role: string): string {
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role })}.signature`;
}

describe("createServerSupabase server key detection", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ["current opaque secret", `sb_secret_${"a".repeat(22)}_${"b".repeat(8)}`],
    ["legacy service-role JWT", legacyJwt("service_role")],
  ])("accepts a %s as elevated", (_label, secret) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", secret);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", legacyJwt("anon"));

    expect(createServerSupabase()).toMatchObject({ mode: "service_role" });
  });

  it.each([
    ["publishable key", `sb_publishable_${"a".repeat(22)}_${"b".repeat(8)}`],
    ["legacy anon JWT", legacyJwt("anon")],
    ["malformed secret prefix", "sb_secret_too-short"],
  ])("never promotes a %s", (_label, key) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", key);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", legacyJwt("anon"));

    expect(createServerSupabase()).toMatchObject({ mode: "anon" });
  });
});
