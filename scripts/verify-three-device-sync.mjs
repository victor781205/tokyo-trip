/**
 * 三端同步驗證：模擬 電腦 / Samsung / iPhone
 * 走與 TripContext 相同的 production 路徑：
 *   - header x-trip-secret
 *   - rpc upsert_sync_state 上送
 *   - select sync_state 拉取
 *   - last-write-wins（updated_at）
 *
 * 用法：
 *   node --env-file=.env.smoke.runtime scripts/verify-three-device-sync.mjs
 */
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { readFileSync, existsSync } from "fs";

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v.trim();
  }
  return out;
}

const fileEnv = {
  ...loadEnvFile(".env.smoke.runtime"),
  ...loadEnvFile(".env.smoke"),
};
const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || fileEnv.NEXT_PUBLIC_SUPABASE_URL || "").trim();
const ANON = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || fileEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || "").trim();
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || fileEnv.NEXT_PUBLIC_SITE_URL || "https://tokyo-trip-rosy.vercel.app").trim();

function token(n = 12) {
  return randomBytes(n).toString("base64url");
}

function makeClient(secret, deviceLabel) {
  // 模擬各裝置瀏覽器：獨立 client、固定 secret header（與 createTripClient 相同）
  return createClient(URL, ANON, {
    global: {
      headers: {
        "x-trip-secret": secret,
        "x-device": deviceLabel,
      },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function food(id, name, device) {
  return {
    id,
    emoji: "🍜",
    name,
    location: device,
    hours: "11:00-21:00",
    desc: `from ${device}`,
    mapLink: "",
    image: "",
  };
}

function names(foods) {
  return (foods || []).map((f) => f.name).sort().join(" | ");
}

async function pull(client, tripId) {
  const { data, error } = await client
    .from("sync_state")
    .select("trip_id, custom_foods, budget_items, packing_list, itinerary, budget_limit, updated_at")
    .eq("trip_id", tripId)
    .maybeSingle();
  return { data, error };
}

async function push(client, tripId, secret, state, at = new Date().toISOString()) {
  // 與 TripContext 正式路徑相同
  const rpc = await client.rpc("upsert_sync_state", {
    p_trip_id: tripId,
    p_trip_secret: secret,
    p_itinerary: state.itinerary ?? {},
    p_budget_limit: state.budget_limit ?? 100000,
    p_budget_items: state.budget_items ?? [],
    p_custom_foods: state.custom_foods ?? [],
    p_packing_list: state.packing_list ?? [],
    p_updated_at: at,
  });
  return rpc;
}

function ok(name, pass, detail = "") {
  console.log(`[${pass ? "PASS" : "FAIL"}] ${name}${detail ? " — " + detail : ""}`);
  return pass;
}

async function main() {
  console.log("=== 三端同步驗證（電腦 / Samsung / iPhone）===");
  console.log("SITE:", SITE);
  console.log("URL:", URL || "MISSING");
  console.log("ANON:", ANON ? `set(${ANON.length})` : "MISSING");

  if (!URL || !ANON) {
    console.error("缺少 Supabase public env");
    process.exit(2);
  }

  // 先確認 production 站可開
  const home = await fetch(SITE + "/");
  if (!ok("production homepage", home.status === 200, `status=${home.status}`)) {
    process.exit(1);
  }

  const tripId = `trip_3dev_${token(8)}`;
  const secret = `sec_3dev_${token(16)}`;
  console.log("trip_id:", tripId);
  console.log("share shape:", `${SITE}/#trip=${tripId}&secret=${secret.slice(0, 6)}…`);

  // 三台裝置 = 三個獨立 client（等同三個瀏覽器 localStorage 各自一份）
  const devices = {
    電腦: makeClient(secret, "desktop-chrome"),
    Samsung: makeClient(secret, "samsung-chrome"),
    iPhone: makeClient(secret, "iphone-safari"),
  };

  // 本機快取模擬（各裝置 localStorage）
  const local = {
    電腦: { custom_foods: [], budget_items: [], packing_list: [], itinerary: {}, budget_limit: 100000, updated_at: 0 },
    Samsung: { custom_foods: [], budget_items: [], packing_list: [], itinerary: {}, budget_limit: 100000, updated_at: 0 },
    iPhone: { custom_foods: [], budget_items: [], packing_list: [], itinerary: {}, budget_limit: 100000, updated_at: 0 },
  };

  let failed = 0;

  // ── Scenario A：電腦建立行程（首次分享）──
  {
    const at = new Date().toISOString();
    local.電腦.custom_foods = [food(1, "一蘭拉麵-電腦建立", "電腦")];
    local.電腦.budget_items = [{ id: 1, name: "交通卡", amount: 3000, category: "交通", date: "2026-07-11" }];
    local.電腦.packing_list = [{ id: "p1", name: "充電器", packed: false, category: "電子" }];
    local.電腦.budget_limit = 100000;
    local.電腦.updated_at = Date.parse(at);

    const res = await push(devices.電腦, tripId, secret, local.電腦, at);
    if (!ok("A. 電腦首次建立行程 (RPC insert)", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;
  }

  // ── Scenario B：Samsung / iPhone 用分享連結進入（拉取雲端）──
  for (const name of ["Samsung", "iPhone"]) {
    const { data, error } = await pull(devices[name], tripId);
    const foodsOk = !error && data && names(data.custom_foods) === names(local.電腦.custom_foods);
    const budgetOk = data?.budget_items?.length === 1;
    const packingOk = data?.packing_list?.length === 1;
    if (
      !ok(
        `B. ${name} 開啟分享連結後看到電腦資料`,
        foodsOk && budgetOk && packingOk,
        error?.message || `foods=${names(data?.custom_foods)} budget=${data?.budget_items?.length} pack=${data?.packing_list?.length}`,
      )
    )
      failed++;
    if (data) {
      local[name].custom_foods = data.custom_foods;
      local[name].budget_items = data.budget_items;
      local[name].packing_list = data.packing_list;
      local[name].budget_limit = data.budget_limit;
      local[name].itinerary = data.itinerary || {};
      local[name].updated_at = Date.parse(data.updated_at);
    }
  }

  // ── Scenario C：Samsung 新增私藏 → 電腦 / iPhone 應拉到 ──
  {
    await sleep(50); // 確保 updated_at 較新
    const at = new Date().toISOString();
    local.Samsung.custom_foods = [
      ...local.Samsung.custom_foods,
      food(2, "一蘭-Samsung新增", "Samsung"),
    ];
    local.Samsung.updated_at = Date.parse(at);
    const res = await push(devices.Samsung, tripId, secret, local.Samsung, at);
    if (!ok("C1. Samsung 新增私藏上送", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;

    for (const name of ["電腦", "iPhone"]) {
      const { data, error } = await pull(devices[name], tripId);
      const expect = names(local.Samsung.custom_foods);
      const pass = !error && names(data?.custom_foods) === expect;
      if (!ok(`C2. ${name} 拉到 Samsung 新增`, pass, error?.message || `got=${names(data?.custom_foods)} expect=${expect}`))
        failed++;
      if (data) {
        local[name].custom_foods = data.custom_foods;
        local[name].updated_at = Date.parse(data.updated_at);
      }
    }
  }

  // ── Scenario D：iPhone 再新增 → 三端一致 ──
  {
    await sleep(50);
    const at = new Date().toISOString();
    local.iPhone.custom_foods = [
      ...local.iPhone.custom_foods,
      food(3, "壽司-iPhone新增", "iPhone"),
    ];
    local.iPhone.updated_at = Date.parse(at);
    const res = await push(devices.iPhone, tripId, secret, local.iPhone, at);
    if (!ok("D1. iPhone 新增私藏上送", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;

    const snaps = {};
    for (const name of ["電腦", "Samsung", "iPhone"]) {
      const { data, error } = await pull(devices[name], tripId);
      snaps[name] = names(data?.custom_foods);
      if (!ok(`D2. ${name} 讀取三筆名單`, !error && (data?.custom_foods || []).length === 3, error?.message || snaps[name]))
        failed++;
      if (data) local[name].custom_foods = data.custom_foods;
    }
    const allSame = snaps.電腦 === snaps.Samsung && snaps.Samsung === snaps.iPhone;
    if (!ok("D3. 三端 custom_foods 完全一致", allSame, JSON.stringify(snaps))) failed++;
  }

  // ── Scenario E：電腦刪一筆 → 手機兩端同步刪除 ──
  {
    await sleep(50);
    const at = new Date().toISOString();
    local.電腦.custom_foods = local.電腦.custom_foods.filter((f) => f.id !== 1);
    local.電腦.updated_at = Date.parse(at);
    const res = await push(devices.電腦, tripId, secret, local.電腦, at);
    if (!ok("E1. 電腦刪除一筆上送", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;

    for (const name of ["Samsung", "iPhone"]) {
      const { data, error } = await pull(devices[name], tripId);
      const hasDeleted = (data?.custom_foods || []).some((f) => f.id === 1);
      const count = (data?.custom_foods || []).length;
      if (!ok(`E2. ${name} 反映刪除`, !error && !hasDeleted && count === 2, error?.message || `count=${count} hasId1=${hasDeleted}`))
        failed++;
      if (data) local[name].custom_foods = data.custom_foods;
    }
  }

  // ── Scenario F：離線後上線（Samsung 離線改、之後上送；iPhone 再拉）──
  {
    // 模擬 Samsung 離線編輯：只改 local，不上送
    local.Samsung.custom_foods = [
      ...local.Samsung.custom_foods,
      food(4, "離線加的-Samsung", "Samsung"),
    ];
    const offlineTs = Date.now() + 10;
    local.Samsung.updated_at = offlineTs;

    // 「上線」後 flush
    const at = new Date(offlineTs).toISOString();
    const res = await push(devices.Samsung, tripId, secret, local.Samsung, at);
    if (!ok("F1. Samsung 離線變更上線後 flush", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;

    for (const name of ["電腦", "iPhone"]) {
      const { data, error } = await pull(devices[name], tripId);
      const has = (data?.custom_foods || []).some((f) => f.name === "離線加的-Samsung");
      if (!ok(`F2. ${name} 看到 Samsung 離線新增`, !error && has, error?.message || names(data?.custom_foods)))
        failed++;
    }
  }

  // ── Scenario G：預算 + 打包清單跨裝置 ──
  {
    await sleep(50);
    const at = new Date().toISOString();
    // 先拉最新，避免覆蓋私藏
    const latest = await pull(devices.iPhone, tripId);
    local.iPhone.custom_foods = latest.data?.custom_foods || local.iPhone.custom_foods;
    local.iPhone.budget_items = [
      ...(latest.data?.budget_items || []),
      { id: 2, name: "iPhone記帳-晚餐", amount: 1200, category: "餐飲", date: "2026-07-11" },
    ];
    local.iPhone.packing_list = [
      ...(latest.data?.packing_list || []),
      { id: "p2", name: "雨傘", packed: true, category: "日用" },
    ];
    local.iPhone.budget_limit = 150000;
    const res = await push(devices.iPhone, tripId, secret, local.iPhone, at);
    if (!ok("G1. iPhone 更新預算/打包", !res.error && res.data?.ok, res.error?.message || JSON.stringify(res.data)))
      failed++;

    for (const name of ["電腦", "Samsung"]) {
      const { data, error } = await pull(devices[name], tripId);
      const budgetOk = (data?.budget_items || []).some((b) => b.name === "iPhone記帳-晚餐");
      const packOk = (data?.packing_list || []).some((p) => p.name === "雨傘" && p.packed === true);
      const limitOk = data?.budget_limit === 150000;
      if (
        !ok(
          `G2. ${name} 同步預算/打包`,
          !error && budgetOk && packOk && limitOk,
          error?.message || `budget=${budgetOk} pack=${packOk} limit=${data?.budget_limit}`,
        )
      )
        failed++;
    }
  }

  // ── Scenario H：錯誤 secret 裝置不可讀寫（模擬舊連結）──
  {
    const stale = makeClient("sec_stale_old_link_xxxxxx", "old-link");
    const { data } = await pull(stale, tripId);
    const readBlocked = data == null;
    const badPush = await push(stale, tripId, "sec_stale_old_link_xxxxxx", {
      custom_foods: [food(99, "hack", "evil")],
      budget_items: [],
      packing_list: [],
      itinerary: {},
      budget_limit: 1,
    });
    const writeBlocked = !!badPush.error || badPush.data?.ok === false;
    if (!ok("H. 舊分享連結(錯誤secret)不可讀寫", readBlocked && writeBlocked, `read=${data != null} writeErr=${badPush.error?.message || badPush.data}`))
      failed++;
  }

  // ── Scenario I：最終三端快照一致 ──
  {
    const final = {};
    for (const name of ["電腦", "Samsung", "iPhone"]) {
      const { data, error } = await pull(devices[name], tripId);
      if (error) {
        if (!ok(`I. ${name} 最終拉取`, false, error.message)) failed++;
        continue;
      }
      final[name] = {
        foods: names(data.custom_foods),
        budgets: (data.budget_items || []).map((b) => b.name).sort().join("|"),
        packing: (data.packing_list || []).map((p) => p.name + (p.packed ? "*" : "")).sort().join("|"),
        limit: data.budget_limit,
        updated_at: data.updated_at,
      };
    }
    const a = JSON.stringify(final.電腦);
    const b = JSON.stringify(final.Samsung);
    const c = JSON.stringify(final.iPhone);
    const same = a === b && b === c;
    if (!ok("I. 最終三端完整快照一致", same, same ? final.電腦.foods : JSON.stringify(final, null, 2)))
      failed++;
    else {
      console.log("    foods:", final.電腦.foods);
      console.log("    budgets:", final.電腦.budgets);
      console.log("    packing:", final.電腦.packing);
      console.log("    limit:", final.電腦.limit);
    }
  }

  // 清理測試列（用正確 secret 無法 DELETE 若 policy 無 delete；嘗試用 update 標記 + 忽略）
  // RLS 通常不給 DELETE，留下 probe row 可接受；命名 trip_3dev_* 可辨識
  console.log("\n(note) 測試列保留於雲端 trip_id=", tripId, "（無 service_role 無法刪）");

  console.log("\n=== DONE ===");
  if (failed) {
    console.log(`FAILED: ${failed} check(s)`);
    process.exit(1);
  }
  console.log("ALL THREE-DEVICE CHECKS PASSED");
  console.log("\n說明：此驗證覆蓋三端共用的 production 同步 API 路徑。");
  console.log("實體裝置請用「同一分享連結」開啟；若某機仍舊資料，硬重整或清該站 site data 後重開連結。");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
