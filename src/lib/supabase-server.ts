import { createClient, type SupabaseClient } from "@supabase/supabase-js";

function jwtRole(jwt: string | undefined): string | null {
  if (!jwt) return null;
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1] ?? "", "base64url").toString("utf8")).role ?? null;
  } catch {
    return null;
  }
}

/**
 * 後端 Supabase client。
 * 優先 service_role；若未設定 / 誤填 anon，則退回 public anon key。
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

  const serviceRole = jwtRole(service);
  if (service && serviceRole === "service_role") {
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
