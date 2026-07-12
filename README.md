# 東京自由行行程規劃（Tokyo Trip Planner）

個人／小團體用的 **Next.js PWA** 行程工具：離線同步、推播、預算 OCR、航班、地圖與打包清單。

- 行程期間：2026-09-01 – 2026-09-06
- 線上站：https://tokyo-trip-rosy.vercel.app
- 技術：Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase · Capacitor 8

---

## 功能

| 模組 | 說明 |
|------|------|
| 行程同步 | `trip_id` + `trip_secret`，localStorage + Supabase Realtime |
| 分享連結 | 使用 **hash**（`#trip=…&secret=…`），載入後會 scrub URL |
| 航班 | TDX + AviationStack |
| 預算 | 記帳 + Tesseract OCR 發票 |
| 美食地圖 | Google Maps Advanced Markers |
| 推播 | Web Push（VAPID）+ FCM（iOS/Android） |
| 晨間提醒 | Vercel Cron → `/api/push/morning-reminder` |
| PWA / 原生 | next-pwa + Capacitor |

---

## 快速開始

### 需求

- Node.js **24**（見 [`.nvmrc`](.nvmrc)）
- npm

### 安裝

```bash
npm install
cp .env.example .env.local
# 填入 Supabase / Maps / VAPID 等金鑰
npm run dev
```

開 [http://localhost:3000](http://localhost:3000)。

### 常用指令

```bash
npm run dev          # 開發伺服器
npm run build        # 正式建置
npm run start        # 啟動建置結果
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest 一次跑完
npm run check        # typecheck + lint + test
npm run web-push:generate-keys   # 產生 VAPID 金鑰
npm run firebase:env             # service account → env 字串
```

---

## 環境變數

完整清單見 [`.env.example`](.env.example)。重點：

| 變數 | 用途 |
|------|------|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 前端 Realtime 同步 |
| `SUPABASE_SERVICE_ROLE_KEY` | 後端推播 / 跨 RLS（**勿公開**） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 地圖 |
| `CRON_SECRET` | 保護 morning-reminder cron |
| `FIREBASE_*` | FCM 原生推播 |

---

## 安全模型（必讀）

1. **行程授權**：每筆行程有 `trip_id` + `trip_secret`。
2. **RLS**：`sync_state` 的 SELECT / 直連寫入依請求 header `x-trip-secret` 驗證。
3. **同步寫入（正式路徑）**：前端優先呼叫 SECURITY DEFINER RPC `upsert_sync_state`；若 DB 尚未套用 migration（`PGRST202`），自動 fallback 為 **UPDATE → INSERT → upsert**。避免 PostgREST + FORCE RLS 下直接 upsert 回模糊的 `new row violates row-level security policy`。
4. **推播**：`push_subscriptions` 表對 anon 直連關閉；API 走 SECURITY DEFINER RPC（`upsert_push_subscription` 等），即使 Vercel 沒有有效 `service_role` key 也能運作。
5. **必須在 Supabase 執行 migration**（程式碼無法代替 Dashboard 套用 DDL）。目前最重要：
   - [`supabase/migrations/20260709030000_rls_nuclear_fix.sql`](supabase/migrations/20260709030000_rls_nuclear_fix.sql)（完整 RLS）
   - [`supabase/migrations/20260709040000_push_rpc_security_definer.sql`](supabase/migrations/20260709040000_push_rpc_security_definer.sql)（推播 RPC）
   - [`supabase/migrations/20260710000000_allow_secret_rotation.sql`](supabase/migrations/20260710000000_allow_secret_rotation.sql)（UPDATE policy 放寬）
   - [`supabase/migrations/20260710010000_rotate_trip_secret_rpc.sql`](supabase/migrations/20260710010000_rotate_trip_secret_rpc.sql)（**實際輪換路徑**：`rotate_trip_secret` SECURITY DEFINER RPC）
   - [`supabase/migrations/20260711070000_upsert_sync_state_rpc.sql`](supabase/migrations/20260711070000_upsert_sync_state_rpc.sql)（**行程上送正式路徑**：`upsert_sync_state`；前端已有 fallback，建議仍套用）
6. **分享**：優先使用 hash 片段，避免 secret 進 query / server log / Referer。
7. **Token**：使用 [`src/lib/secure-id.ts`](src/lib/secure-id.ts)（CSPRNG）。

### 套用（Supabase SQL Editor）

1. 開啟 Supabase Dashboard → SQL Editor
2. 貼上並執行 [`supabase/migrations/20260711070000_upsert_sync_state_rpc.sql`](supabase/migrations/20260711070000_upsert_sync_state_rpc.sql)
3. 本地回測：

```bash
node scripts/probe-upsert-rpc.mjs
node --env-file=.env.smoke.runtime scripts/smoke-rls.mjs
```

套用後：anon 無 secret 不可掃表；`upsert_sync_state` 錯誤 secret → forbidden、正確 → ok。
**注意**：若仍失敗，優先檢查是否用了舊分享連結（secret 已輪換）。

---

## 專案結構（精簡）

```
src/
  app/                 # App Router + API routes
  components/          # UI
  context/TripContext  # 同步、登入、分享連結
  hooks/               # useTripState, usePushNotifications
  lib/                 # validations, rate-limit, secure-id, firebase
  __tests__/           # Vitest
supabase/migrations/   # SQL（含安全 RLS）
scripts/               # VAPID / Firebase 工具
```

---

## 部署（Vercel）

1. 設定與 `.env.example` 對應的 Environment Variables
2. 啟用 Cron（見 [`vercel.json`](vercel.json)）並設定 `CRON_SECRET`
3. 在 Supabase 套用 **secure RLS** migration
4. `npm run build` 應通過；CI 見 [`.github/workflows/ci.yml`](.github/workflows/ci.yml)

---

## Capacitor（可選）

```bash
npm run build
npm run cap:add:android   # 或 ios
npm run cap:sync
npm run cap:open:android
```

`capacitor.config.ts` 預設指向正式站 URL；本機可設 `CAPACITOR_SERVER_URL`。

---

## 測試與健檢

- Unit tests：`npm test`（validations / rate-limit / ics / secure-id）
- 完整門檻：`npm run check`
- 歷史健檢報告：[`HEALTH_CHECK_REPORT.md`](HEALTH_CHECK_REPORT.md)

---

## 授權

私人專案 © 2026 Tokyo Trip Planner · Powered by Victor
