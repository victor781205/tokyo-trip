/**
 * 線上回測：RLS + sync_state + push subscribe
 * 用法：
 *   node --env-file=.env.smoke.runtime scripts/smoke-rls.mjs
 * 或先：
 *   node scripts/extract-public-env.mjs
 *
 * 需：NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 * 可選：SUPABASE_SERVICE_ROLE_KEY（清理測試資料、驗證 service write）
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.trim() || "https://tokyo-trip-rosy.vercel.app";

function token(bytes = 16) {
  return randomBytes(bytes).toString("base64url");
}

function clientWithSecret(secret) {
  return createClient(URL, ANON, {
    global: { headers: { "x-trip-secret": secret } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function bareClient() {
  return createClient(URL, ANON, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function adminClient() {
  if (!SERVICE) return null;
  return createClient(URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function ok(name, pass, detail = "") {
  const mark = pass ? "PASS" : "FAIL";
  console.log(`[${mark}] ${name}${detail ? " — " + detail : ""}`);
  return pass;
}

function jwtRole(jwt) {
  try {
    return JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8")).role;
  } catch {
    return null;
  }
}

async function main() {
  console.log("=== Tokyo Trip smoke / RLS retest ===");
  console.log("SITE:", SITE);
  console.log("SUPABASE_URL:", URL ? URL.replace(/https?:\/\//, "") : "MISSING");
  console.log("ANON:", ANON ? `set (${ANON.length}) role=${jwtRole(ANON)}` : "MISSING");
  console.log("SERVICE:", SERVICE ? `set (${SERVICE.length}) role=${jwtRole(SERVICE)}` : "MISSING");

  if (!URL || !ANON) {
    console.error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 ANON_KEY");
    process.exit(2);
  }

  let failed = 0;
  const tripId = `trip_smoke_${token(8)}`;
  const secret = `sec_${token(18)}`;
  const wrongSecret = `sec_${token(18)}`;
  // 0) helper function 是否存在
  {
    const c = clientWithSecret("sec_probe_function_xx");
    const { data, error } = await c.rpc("requesting_trip_secret");
    const pass = !error && data === "sec_probe_function_xx";
    if (!ok("rpc requesting_trip_secret reads header", pass, error?.message || `data=${data}`)) failed++;
  }

  // 1) 無 secret 不應掃到全表
  {
    const bare = bareClient();
    const { data, error } = await bare.from("sync_state").select("trip_id,trip_secret").limit(5);
    const pass = !error && Array.isArray(data) && data.length === 0;
    if (!ok("anon without secret cannot list sync_state", pass, error ? error.message : `rows=${data?.length}`)) {
      failed++;
      if (data?.length) {
        console.log("  !! CRITICAL: secrets still exposed, sample=", data.slice(0, 2));
      }
    }
  }

  // 2) 正確 secret 可經 upsert_sync_state RPC 建立（前端正式路徑）
  {
    const c = clientWithSecret(secret);
    const { data, error } = await c.rpc("upsert_sync_state", {
      p_trip_id: tripId,
      p_trip_secret: secret,
      p_itinerary: { day1: { title: "smoke", date: "2026-09-01", activities: [] } },
      p_budget_items: [],
      p_budget_limit: 100000,
      p_custom_foods: [],
      p_packing_list: [],
      p_updated_at: new Date().toISOString(),
    });
    const pass = !error && data && (data.ok === true || data.action === "insert" || data.action === "update");
    if (!ok("rpc upsert_sync_state insert with matching secret", pass, error?.message || JSON.stringify(data))) failed++;
  }

  // 2b) 錯誤 secret 不可透過 RPC 覆寫既有行程
  {
    const c = clientWithSecret(wrongSecret);
    const { error } = await c.rpc("upsert_sync_state", {
      p_trip_id: tripId,
      p_trip_secret: wrongSecret,
      p_itinerary: {},
      p_budget_items: [],
      p_budget_limit: 1,
      p_custom_foods: [{ id: 1, name: "hack" }],
      p_packing_list: [],
      p_updated_at: new Date().toISOString(),
    });
    const pass = !!error;
    if (!ok("rpc upsert_sync_state rejects wrong secret", pass, error ? error.message : "unexpected success")) failed++;
  }

  // 2c) 正確 secret 可再經 RPC 更新（含 custom_foods）
  {
    const c = clientWithSecret(secret);
    const foods = [{ id: 1, emoji: "🍜", name: "smoke ramen", location: "新宿", hours: "", desc: "", mapLink: "", image: "" }];
    const { data, error } = await c.rpc("upsert_sync_state", {
      p_trip_id: tripId,
      p_trip_secret: secret,
      p_itinerary: { day1: { title: "smoke", date: "2026-09-01", activities: [] } },
      p_budget_items: [],
      p_budget_limit: 100000,
      p_custom_foods: foods,
      p_packing_list: [],
      p_updated_at: new Date().toISOString(),
    });
    const check = await c.from("sync_state").select("custom_foods").eq("trip_id", tripId).maybeSingle();
    const gotName = Array.isArray(check.data?.custom_foods) ? check.data.custom_foods[0]?.name : null;
    const pass = !error && data?.ok !== false && gotName === "smoke ramen";
    if (!ok("rpc upsert_sync_state update custom_foods", pass, error?.message || `name=${gotName}`)) failed++;
  }

  // 3) 正確 secret 可 select 自己的 row
  {
    const c = clientWithSecret(secret);
    const { data, error } = await c.from("sync_state").select("trip_id, trip_secret, budget_limit").eq("trip_id", tripId).maybeSingle();
    const pass = !error && data?.trip_id === tripId && data?.trip_secret === secret;
    if (!ok("select own row with secret", pass, error?.message || JSON.stringify(data))) failed++;
  }

  // 4) 錯誤 secret 不可讀
  {
    const c = clientWithSecret(wrongSecret);
    const { data, error } = await c.from("sync_state").select("trip_id").eq("trip_id", tripId).maybeSingle();
    // 預期：data null，不一定 error
    const pass = !data;
    if (!ok("wrong secret cannot read row", pass, error ? error.message : `data=${JSON.stringify(data)}`)) failed++;
  }

  // 5) 錯誤 secret 不可 update
  {
    const c = clientWithSecret(wrongSecret);
    const { data, error } = await c
      .from("sync_state")
      .update({ budget_limit: 1, updated_at: new Date().toISOString() })
      .eq("trip_id", tripId)
      .select("budget_limit");
    const pass = !error && (!data || data.length === 0);
    // 再確認值沒被改
    const check = await clientWithSecret(secret).from("sync_state").select("budget_limit").eq("trip_id", tripId).maybeSingle();
    const unchanged = check.data?.budget_limit === 100000;
    if (!ok("wrong secret cannot update", pass && unchanged, error?.message || `budget=${check.data?.budget_limit}`)) failed++;
  }

  // 6) 正確 secret 可 update
  {
    const c = clientWithSecret(secret);
    const { error } = await c
      .from("sync_state")
      .update({ budget_limit: 123456, updated_at: new Date().toISOString() })
      .eq("trip_id", tripId);
    const check = await c.from("sync_state").select("budget_limit").eq("trip_id", tripId).maybeSingle();
    const pass = !error && check.data?.budget_limit === 123456;
    if (!ok("update with matching secret", pass, error?.message || `budget=${check.data?.budget_limit}`)) failed++;
  }

  // 7) push_subscriptions：anon 不可直接寫
  {
    const c = clientWithSecret(secret);
    const { error } = await c.from("push_subscriptions").upsert(
      {
        trip_id: tripId,
        token: `smoke-token-${token(6)}`,
        platform: "web",
        keys: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "trip_id,token" },
    );
    // 預期失敗（無 policy）
    const pass = !!error;
    if (!ok("anon cannot write push_subscriptions", pass, error ? error.message : "unexpected success")) failed++;
  }

  // 8) push_subscriptions：anon 不可 list
  {
    const bare = bareClient();
    const { data, error } = await bare.from("push_subscriptions").select("token").limit(5);
    const pass = (!!error) || (Array.isArray(data) && data.length === 0);
    // 嚴格：最好有 error 或空
    if (!ok("anon cannot list push_subscriptions", pass, error ? error.message : `rows=${data?.length}`)) failed++;
  }

  // 9) 線上 API：push subscribe 錯誤 secret 應 403（若行程已存在）
  {
    try {
      const res = await fetch(`${SITE}/api/push/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          trip_secret: wrongSecret,
          token: `web-endpoint-${token(8)}`,
          platform: "web",
          keys: { p256dh: "x", auth: "y" },
        }),
      });
      const body = await res.json().catch(() => ({}));
      const pass = res.status === 403;
      if (!ok("POST /api/push/subscribe wrong secret → 403", pass, `status=${res.status} body=${JSON.stringify(body)}`)) failed++;
    } catch (e) {
      if (!ok("POST /api/push/subscribe wrong secret → 403", false, String(e))) failed++;
    }
  }

  // 10) 線上 API：正確 secret 應可訂閱
  {
    try {
      const res = await fetch(`${SITE}/api/push/subscribe`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          trip_secret: secret,
          token: `https://example.com/push/${token(8)}`,
          platform: "web",
          keys: { p256dh: "smoke-p256dh", auth: "smoke-auth" },
        }),
      });
      const body = await res.json().catch(() => ({}));
      // 若 production 尚未部署新 API / 缺 service key，可能 500
      const pass = res.status === 200 && body.ok === true;
      if (!ok("POST /api/push/subscribe correct secret → 200", pass, `status=${res.status} body=${JSON.stringify(body)}`)) failed++;
    } catch (e) {
      if (!ok("POST /api/push/subscribe correct secret → 200", false, String(e))) failed++;
    }
  }

  // 11) 線上 API：send 缺參數
  {
    try {
      const res = await fetch(`${SITE}/api/push/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ trip_id: tripId }),
      });
      const pass = res.status === 422 || res.status === 400;
      if (!ok("POST /api/push/send invalid body → 4xx", pass, `status=${res.status}`)) failed++;
    } catch (e) {
      if (!ok("POST /api/push/send invalid body → 4xx", false, String(e))) failed++;
    }
  }

  // 12) 線上首頁可達
  {
    try {
      const res = await fetch(SITE, { method: "GET" });
      if (!ok("GET site homepage 200", res.status === 200, `status=${res.status}`)) failed++;
    } catch (e) {
      if (!ok("GET site homepage 200", false, String(e))) failed++;
    }
  }

  // cleanup（service role）
  const admin = adminClient();
  if (admin) {
    await admin.from("push_subscriptions").delete().eq("trip_id", tripId);
    await admin.from("sync_state").delete().eq("trip_id", tripId);
    console.log("[info] cleaned smoke trip:", tripId);
  } else {
    console.log("[info] skip cleanup (no SERVICE_ROLE); trip left:", tripId);
  }

  console.log("=== DONE ===");
  console.log(failed === 0 ? "ALL CHECKS PASSED" : `FAILED: ${failed}`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
