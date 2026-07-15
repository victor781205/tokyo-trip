// @vitest-environment node

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { createContentSecurityPolicy } from "../../next.config";

const root = process.cwd();

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const fullPath = join(directory, name);
    if (statSync(fullPath).isDirectory()) {
      if (name === "__tests__") return [];
      return sourceFiles(fullPath);
    }
    return /\.[cm]?[jt]sx?$/.test(name) ? [fullPath] : [];
  });
}

describe("release security contracts", () => {
  it("declares every application environment variable in .env.example", () => {
    const example = readFileSync(join(root, ".env.example"), "utf8");
    const declared = new Set(
      [...example.matchAll(/^\s*([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1]),
    );
    const platformProvided = new Set(["CI", "NODE_ENV", "VERCEL_ENV"]);
    const files = [
      ...sourceFiles(join(root, "src")),
      join(root, "next.config.ts"),
      join(root, "capacitor.config.ts"),
    ];
    const missing: string[] = [];

    for (const file of files) {
      const source = readFileSync(file, "utf8");
      const references = source.matchAll(
        /process\.env(?:\.([A-Z][A-Z0-9_]*)|\[["']([A-Z][A-Z0-9_]*)["']\])/g,
      );
      for (const match of references) {
        const key = match[1] || match[2];
        if (!declared.has(key) && !platformProvided.has(key)) {
          missing.push(`${relative(root, file)}:${key}`);
        }
      }
    }

    expect(missing).toEqual([]);
    expect(example).toContain("SUPABASE_SERVICE_ROLE_KEY=");
    expect(example).toContain("CRON_SECRET=");
  });

  it("keeps the retired cron secret-leaking RPC unavailable", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20260714000000_remove_unsafe_cron_rpc.sql"),
      "utf8",
    );
    const cronRoute = readFileSync(
      join(root, "src/app/api/push/morning-reminder/route.ts"),
      "utf8",
    );

    expect(migration).toMatch(/REVOKE\s+ALL[\s\S]+list_push_trips_for_cron/i);
    expect(migration).toMatch(/DROP\s+FUNCTION\s+IF\s+EXISTS\s+public\.list_push_trips_for_cron/i);
    expect(cronRoute).not.toContain("list_push_trips_for_cron");
    expect(cronRoute).toContain('mode !== "service_role"');
  });

  it("binds push subscriptions to an existing credential-matched trip", () => {
    const migration = readFileSync(
      join(root, "supabase/migrations/20260714030000_bind_push_subscriptions_to_existing_trip.sql"),
      "utf8",
    );

    expect(migration).toMatch(/NOT\s+FOUND\s+OR\s+v_existing_secret\s+IS\s+DISTINCT\s+FROM\s+p_trip_secret/i);
    expect(migration).toMatch(/FOREIGN\s+KEY\s*\(trip_id\)[\s\S]+ON\s+DELETE\s+CASCADE/i);
    expect(migration).toMatch(/push subscription limit reached/i);
    expect(migration).toMatch(/octet_length\(p_token\)\s*>\s*2048/i);
    expect(migration).not.toContain("尚不存在則允許先訂閱");
  });

  it("does not cache private Supabase responses in the service worker", () => {
    const config = readFileSync(join(root, "next.config.ts"), "utf8");
    expect(config).not.toContain('cacheName: "supabase-api"');
    expect(config).not.toMatch(/urlPattern:[^\n]*supabase/i);
  });

  it("uses a production CSP without generic eval and with restrictive fallbacks", () => {
    const production = createContentSecurityPolicy(false);
    const development = createContentSecurityPolicy(true);
    const productionScriptTokens = production
      .split(";")
      .find((directive) => directive.trim().startsWith("script-src"))
      ?.trim()
      .split(/\s+/) ?? [];

    expect(productionScriptTokens).not.toContain("'unsafe-eval'");
    expect(development).toContain("'unsafe-eval'");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("base-uri 'self'");
    expect(production).toContain("form-action 'self'");
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).not.toContain("unpkg.com");
    expect(production).not.toContain("images.unsplash.com");
    expect(production).not.toContain("sentry.io");
    expect(createContentSecurityPolicy(false, "https://public@example.ingest.sentry.io/123"))
      .toContain("https://example.ingest.sentry.io");
    expect(createContentSecurityPolicy(false, "javascript:alert(1)"))
      .not.toContain("javascript:");
  });

  it("keeps the personal itinerary out of search indexes", () => {
    const robots = readFileSync(join(root, "public/robots.txt"), "utf8");
    const sitemap = readFileSync(join(root, "public/sitemap.xml"), "utf8");
    const config = readFileSync(join(root, "next.config.ts"), "utf8");

    expect(robots).toMatch(/User-agent:\s*\*/i);
    expect(robots).toMatch(/Disallow:\s*\//i);
    expect(robots).not.toMatch(/^Allow:\s*\/$/im);
    expect(sitemap).not.toContain("<loc>");
    expect(sitemap).not.toContain("tokyo-trip.vercel.app");
    expect(config).toContain('key: "X-Robots-Tag"');
    expect(config).toContain('key: "Permissions-Policy"');
  });
});
