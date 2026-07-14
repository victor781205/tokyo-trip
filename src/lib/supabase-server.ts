import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function jwtRole(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

function isElevatedServerKey(key: string | undefined): boolean {
  if (!key) return false;
  // Supabase's current server-only keys are opaque rather than JWTs. Keep
  // legacy service_role JWT support during the migration period, but never
  // treat an sb_publishable_ key as elevated.
  return /^sb_secret_[A-Za-z0-9_-]{20,}$/.test(key) || jwtRole(key) === "service_role";
}

/**
 * 後端 Supabase client。
 * 優先 server-only secret（新 sb_secret_ 或 legacy service_role JWT）；
 * 若未設定 / 誤填 public key，才退回 anon。
 * push 表操作請改走 SECURITY DEFINER RPC，勿直接 .from("push_subscriptions")。
 */
export function createServerSupabase(): {
  client: SupabaseClient;
  mode: "service_role" | "anon";
  error?: string;
} {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();

  if (!url) {
    return {
      client: null as unknown as SupabaseClient,
      mode: "anon",
      error: "缺少 NEXT_PUBLIC_SUPABASE_URL",
    };
  }

  if (service && isElevatedServerKey(service)) {
    return {
      client: createClient(url, service, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      mode: "service_role",
    };
  }

  if (anon) {
    return {
      client: createClient(url, anon, {
        auth: { persistSession: false, autoRefreshToken: false },
      }),
      mode: "anon",
    };
  }

  return {
    client: null as unknown as SupabaseClient,
    mode: "anon",
    error: "缺少 SUPABASE_SERVICE_ROLE_KEY 與 NEXT_PUBLIC_SUPABASE_ANON_KEY",
  };
}

export function isForbiddenRpcError(message: string | undefined): boolean {
  if (!message) return false;
  const m = message.toLowerCase();
  return (
    m.includes("forbidden") ||
    m.includes("42501") ||
    m.includes("permission denied") ||
    m.includes("not authorized")
  );
}
