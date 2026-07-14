# 東京自由行行程規劃（Tokyo Trip Planner）

個人／小團體用的 **Next.js PWA** 行程工具：離線同步、推播、預算 OCR、航班、地圖與打包清單。

- 行程期間：2026-09-01 – 2026-09-06
- 線上站：https://tokyo-trip-rosy.vercel.app
- 技術：Next.js 16 · React 19 · TypeScript · Tailwind 4 · Supabase · Capacitor 8

---

## 功能

| 模組 | 說明 |
|------|------|
| 行程同步 | `trip_id` + `trip_secret`，localStorage + 憑證綁定的 Supabase REST/CAS 同步 |
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
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 前端憑證綁定同步 |
| `SUPABASE_SERVICE_ROLE_KEY` | 後端推播 / 跨 RLS（**勿公開**） |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | 地圖 |
| `CRON_SECRET` | 保護 morning-reminder cron |
| `FIREBASE_*` | FCM 原生推播 |

---

## 安全模型（必讀）

1. **行程授權**：每筆行程有 `trip_id` + `trip_secret`。
2. **RLS**：`sync_state` 讀取必須同時帶正確的 `x-trip-id` 與 `x-trip-secret`；anon 只能讀取不含 secret 的 DTO 欄位，也不能直接寫表。
3. **同步寫入（唯一正式路徑）**：前端呼叫 SECURITY DEFINER RPC `sync_trip_slices`，用 server revision 做 CAS，只寫入變更中的資料切片。舊版 `upsert_sync_state` 已撤權，沒有不安全的直寫 fallback。
4. **推播**：訂閱 RPC 只接受已存在且 secret 完全相符的行程。晨間 cron 必須使用 Vercel `CRON_SECRET`，後端資料存取只使用 `service_role`。
5. **Migration**：依時間順序套用 [`supabase/migrations`](supabase/migrations)。不要挑單一舊 migration 手動執行；以 Supabase CLI 的 migration history 與 `db push` 為準。
6. **分享**：優先使用 hash 片段，避免 secret 進 query / server log / Referer。
7. **Token**：使用 [`src/lib/secure-id.ts`](src/lib/secure-id.ts)（CSPRNG）。

### 套用（Supabase CLI）

先確認 CLI 已登入且專案已 `supabase link`，再檢查差異並依序套用：

```bash
npx supabase migration list --linked
npx supabase db push --linked --dry-run
npx supabase db push --linked
```

套用後應驗證：無憑證或單一 header 無法讀行程、回應不含 `trip_secret`、舊 RPC 不可呼叫、`sync_trip_slices` 的正確憑證與 revision 可成功完成 CAS。

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
