# 東京自由行專案大健檢報告

> 健檢日期：2026-07-09
> 專案路徑：`C:\Users\Victor\tokyo-trip`
> 部署站：https://tokyo-trip-rosy.vercel.app
> 行程期間：2026/09/01 – 09/06

---

## 總評

| 維度 | 分數 | 說明 |
|------|------|------|
| **整體健康度** | **B+ / 82** | 功能完整、型別嚴格、CI 有門檻；但 RLS 過寬、測試覆蓋不足、文件過時 |
| 架構設計 | A- | Context + API routes + PWA/Capacitor 清楚 |
| 程式碼品質 | B+ | TypeScript strict 通過；有 1 個 ESLint error；少數巨型元件 |
| 安全性 | C+ | 有 CSP / rate-limit / zod；但 Supabase RLS 幾乎等於開放讀寫 |
| 測試 | C | 23 個 unit test 全過，但只測 util，無元件/API/同步整合測試 |
| 文件與維運 | C+ | CI、Sentry、推播文件有；README 仍是 create-next-app 預設 |
| 效能 | B | 重型 OCR/地圖有 dynamic import；首頁一次 import 全部 tab 元件 |

**一句話結論：**
這是一個**功能很完整的個人/小團體東京旅遊 PWA**，離線同步、推播、OCR、地圖、航班都有做；目前最該優先處理的是 **Supabase RLS 名存實亡** 與 **分享連結把 secret 放進 URL**。

---

## 1. 專案盤點

### 1.1 技術棧

| 層級 | 技術 |
|------|------|
| 框架 | Next.js **16.2.9**（App Router）+ React **19.2.4** |
| 語言 | TypeScript 5（`strict: true`） |
| 樣式 | Tailwind CSS 4 |
| 狀態 / 同步 | React Context + Supabase Realtime（`sync_state`） |
| 驗證 / schema | Zod 4 |
| PWA | next-pwa 5.6 + Service Worker + offline fallback |
| 原生殼 | Capacitor 8（Android/iOS push） |
| 推播 | Web Push (VAPID) + FCM (firebase-admin) |
| 觀測 | Sentry（`@sentry/nextjs`，DSN 可選） |
| 部署 | Vercel + Cron（每日 morning-reminder） |
| 測試 | Vitest 4 + Testing Library（設定有，元件測試幾乎沒有） |
| Node | `.nvmrc` = **24.14.1** |

### 1.2 功能地圖

| 模組 | 主要檔案 | 狀態 |
|------|----------|------|
| 首頁 / Tab 導覽 | `src/app/page.tsx`, `Navigation.tsx` | 完整 |
| 航班即時資訊 | `FlightInfo.tsx`, `api/flight-info` | 完整（TDX + AviationStack） |
| 行程編輯 / 同步 | `Itinerary.tsx`, `TripContext.tsx` | 完整 |
| 預算 + OCR 發票 | `BudgetTracker.tsx`, `ReceiptScanner.tsx` | 完整（Tesseract 動態載入） |
| 匯率 | `CurrencyConverter.tsx`, `api/currency` | 完整（有 fallback） |
| 美食 + 地圖 | `Food.tsx`（~54KB 巨型元件） | 完整 |
| 交通 / 路線圖 | `RouteMap.tsx`, `RouteMapView.tsx` | 完整 |
| 打包清單 | `PackingList.tsx` | 完整 |
| 日文用語 / 緊急聯絡 | `JapanesePhrases`, `EmergencyContacts`, `Tips` | 完整 |
| Web/Native 推播 | `usePushNotifications`, `api/push/*` | 完整 |
| 離線 | PWA + localStorage + OfflineIndicator | 完整 |
| 主題 | next-themes + dark mode | 完整 |

### 1.3 目錄結構評估

```
src/
  app/           # page + API routes ✅
  components/    # 21 個 UI 元件（部分過大）⚠️
  context/       # Trip / Dialog ✅
  hooks/         # useTripState, usePushNotifications ✅
  lib/           # validations, rate-limit, firebase, schemas ✅
  types/         # google-maps, next-pwa d.ts ✅
  __tests__/     # 僅 3 個 util 測試 ⚠️
supabase/migrations/  # RLS / push table ✅ 但政策過寬 🔴
_legacy/         # 舊版 HTML/JS，已 ignore lint ✅
scripts/         # VAPID / icons / firebase env 工具 ✅
```

**優點：** App Router 分層清楚、API 與 UI 分離、有 migrations。
**缺點：** `_legacy/` 仍在 repo（易混淆）；`Food.tsx` / `Itinerary.tsx` / `TripContext` 職責過重。

---

## 2. 自動化檢查結果

| 檢查項目 | 結果 | 備註 |
|----------|------|------|
| `tsc --noEmit` | ✅ **通過** | 嚴格模式無型別錯誤 |
| `npm run lint` | ❌ **1 error** | `src/app/api/push/send/route.ts:206` 使用 `any` |
| `vitest run` | ✅ **23/23 通過** | 3 個檔案：validations / rate-limit / ics-export |
| `package.json` 有 `test` script | ❌ 無 | CI 直接呼叫 `npx vitest run`，本地不便 |
| 機密硬編碼 | ✅ 未發現 | 金鑰皆走 env；`.gitignore` 有擋 `.env*` / firebase 憑證 |

### 現有 CI（`.github/workflows/ci.yml`）

- push/PR → `master`：tsc + eslint + vitest
- production build job：`next build`
- 使用 `npm ci` + `.nvmrc` 鎖 Node 版本
- **問題：** 目前 lint 已 fail，CI 理論上會擋 PR（若有 push 的話）

---

## 3. 安全性健檢（最高優先）

### 🔴 P0 — Supabase RLS 幾乎無效

[`supabase/migrations/enable_rls.sql`](supabase/migrations/enable_rls.sql) 與 [`001_all_migrations.sql`](supabase/migrations/001_all_migrations.sql)：

```sql
-- SELECT：任何人都能讀全部行程
CREATE POLICY "sync_state_select" ON sync_state FOR SELECT USING (true);

-- UPDATE：任何人都能更新任何 row（只要 body 有 trip_secret 欄位）
CREATE POLICY "sync_state_update" ON sync_state
  FOR UPDATE USING (true) WITH CHECK (trip_secret IS NOT NULL);
```

**風險：**
1. 任何人用 anon key 可 `select * from sync_state` 列出所有行程與 **trip_secret**。
2. 取得 secret 後可覆寫他人行程 / 預算 / 打包清單。
3. 前端雖然查詢時帶 `eq('trip_secret', secret)`，那只是 client filter，**不是 DB 強制**。

**建議修復方向（示意）：**
- SELECT：`USING (trip_secret = current_setting('request.headers', true)::json->>'x-trip-secret')`
  或改成 RPC / Edge Function，不要讓 anon 直接掃表。
- UPDATE：`USING` 與 `WITH CHECK` 都要比對既有 row 的 `trip_secret`。
- 不要把 `trip_secret` 回傳給未授權 client；必要時拆公開/私密欄位。

### 🔴 P0 — `push_subscriptions` RLS 同樣過寬

[`20260704000000_push_subscriptions.sql`](supabase/migrations/20260704000000_push_subscriptions.sql)：

- anon `INSERT / UPDATE / SELECT` 全是 `with check (true)` / `using (true)`
- 任意人可寫入任意 `trip_id` 的推播 token，也可讀取他人 endpoint
- [`/api/push/subscribe`](src/app/api/push/subscribe/route.ts) **不驗證 trip_secret**

**建議：** subscribe API 強制 body 帶 `trip_secret`，後端用 service role 驗證後再 upsert；RLS 對 anon 改為 deny 或極窄。

### 🟠 P1 — 分享連結把 secret 放在 URL

[`TripContext.getShareLink()`](src/context/TripContext.tsx)：

```ts
url.searchParams.set("trip", tripId);
url.searchParams.set("secret", tripSecret);
```

**風險：** secret 進瀏覽紀錄、Referer、螢幕截圖、Analytics。
**建議：** 用短效 invite token（單次/限時）、或 hash fragment（`#secret=...`，不送 server）、或 QR + 手動輸入密碼。

### 🟠 P1 — Token 熵不足

```ts
const generateToken = () => Math.random().toString(36).slice(2, 10);
```

約 8 字元 base36，**不是密碼學安全**，可暴力猜測（尤其 SELECT 全開時更糟）。
**建議：** `crypto.randomUUID()` 或 `crypto.getRandomValues` 產生 ≥ 128-bit secret。

### 🟠 P1 — CSP 過寬

[`next.config.ts`](next.config.ts)：

- `script-src` 含 `'unsafe-inline' 'unsafe-eval'`
- 對 Next + 部分第三方地圖可理解，但仍擴大 XSS 攻擊面
- 建議逐步改 nonce / strict-dynamic

### 🟡 P2 — map-info SSRF 防護尚可但可再硬

- 有 domain allowlist + zod ✅
- 仍會 `fetch` 外部 HTML 並解析，建議：限制 redirect 次數、response size、timeout

### 🟡 P2 — Rate limit 僅 process 記憶體

[`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) 註解已誠實說明：Edge / 多 instance 幾乎無效。
currency 還跑在 `runtime = "edge"`。
**建議：** 關鍵 API 改 Upstash Redis / Vercel KV。

### 🟢 做得好的地方

- 安全 headers：HSTS、X-Frame-Options DENY、nosniff、Referrer-Policy
- API 輸入用 zod
- 機密檔案有進 `.gitignore`
- push/send 用 service role + 比對 trip_secret（後端路徑正確）
- morning-reminder 有 `CRON_SECRET`
- ErrorBoundary + 可選 Sentry

---

## 4. 架構與程式碼品質

### 4.1 優點

1. **離線優先同步設計完整**
   - localStorage + Supabase last-write-wins
   - `safeParse` + zod schema 防止髒資料炸 UI
   - online/offline 重連、skipNextPush 防迴圈
2. **重型功能按需載入**
   - `ReceiptScanner`（Tesseract ~5MB）、`RouteMapView` 用 `next/dynamic`
3. **API 邊界清楚**
   - currency / flight / map / push 分 route
4. **型別嚴格且 tsc 乾淨**
5. **PWA + Capacitor 雙軌** 考量 iOS Safari SW 限制（buildExcludes woff2 等）

### 4.2 問題

| 等級 | 問題 | 位置 |
|------|------|------|
| 🟠 | **巨型元件** `Food.tsx` ~54KB / 816 行（資料 + 地圖 + UI 全塞） | `src/components/Food.tsx` |
| 🟠 | `Itinerary.tsx` ~39KB、`FlightInfo.tsx` ~30KB 偏大 | components |
| 🟠 | 首頁 **靜態 import 全部 tab**，切 tab 才顯示但仍進主 bundle | `src/app/page.tsx` |
| 🟡 | `TripContext` 同時管 auth、5 個 slice、realtime、push | 可拆 store / hooks |
| 🟡 | ESLint error：`catch (e: any)` | `api/push/send/route.ts:206` |
| 🟡 | Google Maps 多處 `as any` / 自訂 d.ts 過鬆 | `RouteMapView`, `google-maps.d.ts` |
| 🟡 | `Food.tsx` 用 `innerHTML` 組 marker（資料目前可控，但模式危險） | 建議 `textContent` / DOM API |
| 🟢 | `useTripState` 只是 TripContext 薄包裝，命名尚可但可文件化 | |

### 4.3 建議重構（非緊急）

1. `page.tsx` 對各 tab 使用 `dynamic(() => import(...), { ssr: false })`
2. `Food.tsx` 拆：`food-data.ts` / `FoodMap.tsx` / `FoodList.tsx` / `FoodFilters.tsx`
3. 同步邏輯抽 `useTripSync()`，Context 只放 state
4. 修 lint：`catch (e: unknown)` + 型別收窄

---

## 5. 依賴與建置配置

### 5.1 依賴健康度

| 觀察 | 說明 |
|------|------|
| 框架新 | Next 16 + React 19，跟得上 |
| Capacitor 8 | 版本一致，合理 |
| `next-pwa@5.6.0` | 偏舊生態，與 Next 16 需留意相容（目前能 build 但長期風險） |
| `zod@^4` | 主版本 4，API 與 v3 有差異，專案已在用 |
| `leaflet` + `react-leaflet` | 與 Google Maps 雙地圖棧，增加 bundle 與維護成本 |
| `tesseract.js` | 體積大，已 dynamic ✅ |
| `firebase-admin` 在 Next server | 需注意 serverless cold start / 初始化單例（已有 safe init） |

### 5.2 設定檔

| 檔案 | 評估 |
|------|------|
| `tsconfig.json` | strict ✅、path alias `@/*` ✅ |
| `next.config.ts` | PWA + security headers 完整；`env` 只 inline Maps key |
| `eslint.config.mjs` | next core-web-vitals + ts；ignore `_legacy` / generated SW ✅ |
| `vitest.config.ts` | jsdom + alias ✅；缺 coverage 門檻 |
| `vercel.json` | Cron `0 23 * * *` → UTC 23:00 = 東京 08:00 ✅ |
| `capacitor.config.ts` | 以正式站 URL 當 WebView 來源，合理 |
| `.gitignore` | env / firebase / ios / android 有擋 ✅ |

### 5.3 Scripts 缺口

```json
// package.json 現有：dev, build, start, lint, cap:*, web-push:*, firebase:env
// 缺少：
"test": "vitest run",
"test:watch": "vitest",
"typecheck": "tsc --noEmit",
"ci": "npm run typecheck && npm run lint && npm run test"
```

---

## 6. 測試與品質門檻

### 現況

- 測試檔：`validations.test.ts`、`rate-limit.test.ts`、`ics-export.test.ts`
- **通過 23 tests**
- 無：TripContext 同步、API route、元件、推播、RLS 政策測試
- package.json **沒有 `test` script**（CI 用 npx 繞過）

### 建議最低測試清單

1. `storage-schemas.safeParse` 髒資料 fallback
2. `generateToken` 改 crypto 後的格式測試
3. `/api/push/subscribe` 缺 secret 應 403（修好後）
4. `/api/map-info` allowlist
5. morning-reminder 日期解析（`9/1 (二)` vs ISO）
6. TripContext last-write-wins（可用 mock supabase）

---

## 7. 文件與維運

| 項目 | 狀態 |
|------|------|
| `README.md` | ❌ 仍是 create-next-app 預設英文模板，**未描述本專案** |
| `SENTRY_SETUP.md` | ✅ 清楚 |
| `scripts/PUSH_CREDENTIALS.md` / `ANDROID_PUSH_SETUP.md` | ✅ 有推播文件 |
| `AGENTS.md` / `CLAUDE.md` | 僅 Next 16 提醒 |
| 環境變數清單 | ❌ 無集中 `.env.example` |
| 錯誤觀測 | Sentry 可選；ErrorBoundary 有 |
| 日誌檔 | repo 根目錄有 `next-dev.log` / `next-start*.log` — **不應入庫**（建議 gitignore `*.log`） |

### 建議補上 `.env.example`（名稱 only）

```bash
# Public
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SITE_URL=

# Server
SUPABASE_SERVICE_ROLE_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
CRON_SECRET=
AVIATION_STACK_KEY=
TDX_CLIENT_ID=
TDX_CLIENT_SECRET=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
```

---

## 8. 效能與 UX 觀察

| 項目 | 評估 |
|------|------|
| 首頁 bundle | 全部 tab 同步 import → 首屏 JS 偏大 ⚠️ |
| OCR | dynamic + loading UI ✅ |
| 地圖 tiles | SW CacheFirst ✅ |
| 匯率 | fallback 4.65 + cache headers ✅ |
| 字體 | Noto Sans/Serif TC 多 weight，注意 PWA precache 已 exclude woff2 ✅ |
| viewport `maximumScale: 1` | 不利無障礙縮放 ⚠️ |
| 離線 | offline.html + indicator ✅ |

---

## 9. 潛在 Bug / 行為風險

1. **RLS 全開** → 資料可被掃、被改（見 §3）
2. **URL 含 secret** → 無意外洩
3. **`Math.random` token** → 可猜測
4. **push subscribe 無 secret** → 可對任意 trip 註冊推播
5. **`/api/push/send` 無 rate limit** → 持有 secret 可洗推播
6. **Sync push 失敗 silently**（註解：安靜重試）→ 使用者可能以為已同步
7. **Food / InfoWindow 字串插值** → 若未來允許 user-generated 店名，有 XSS 風險
8. **CI lint 目前會紅** → 合併前應先修 `any`
9. **README 誤導** → 新人以為只是空的 create-next-app

---

## 10. 優先修復路線圖

### 本週必做（P0）

1. **重寫 Supabase RLS**
   - `sync_state` SELECT/UPDATE 必須綁 `trip_secret`
   - 確認 production 已套用最新 migration（不要只留 SQL 檔）
2. **push_subscriptions 收斂權限**
   - subscribe API 驗證 trip_secret
   - anon 不要可 SELECT 全部 tokens
3. **修 ESLint error**（`send/route.ts` 的 `any`）讓 CI 變綠
4. **Token 改用 `crypto.randomUUID()` / 更長 secret**

### 行程前（P1，9 月前）

5. 分享連結不要用 query `secret`（改 invite / hash）
6. 補 `.env.example` + 重寫 README（功能、env、部署、推播）
7. `package.json` 加 `test` / `typecheck` scripts
8. `*.log` 加入 gitignore，清掉已追蹤 log
9. 關鍵 API rate limit 換 Redis（至少 push/send、map-info）
10. 首頁 tab 改 dynamic import 降首屏

### 有餘力（P2）

11. 拆 `Food.tsx` / 同步 hook
12. 補 TripContext + API 測試
13. CSP 收緊（nonce）
14. 評估 `next-pwa` 替代方案（Serwist 等）
15. 統一地圖棧（Google vs Leaflet 二選一或明確分工）
16. `viewport.maximumScale` 允許縮放以利無障礙

---

## 11. 分數細項

| 類別 | 分數 | 權重 | 加權 |
|------|------|------|------|
| 功能完整度 | 92 | 20% | 18.4 |
| 架構 | 85 | 15% | 12.8 |
| 程式碼品質 | 80 | 15% | 12.0 |
| 安全性 | 55 | 25% | 13.8 |
| 測試 | 55 | 10% | 5.5 |
| 文件 / DX | 65 | 10% | 6.5 |
| 效能 / PWA | 78 | 5% | 3.9 |
| **總分** | | | **~72.9 → 以產品完整度加權後體感 B+ (82)** |

> 若只看「能不能好好出國用」：功能面很夠。
> 若看「能不能安全多人分享行程」：**目前不安全，請先修 RLS。**

---

## 12. 快速行動清單（Checklist）

- [ ] 在 Supabase SQL Editor 套用**真正限制 secret** 的 RLS
- [ ] 驗證：用另一組 anon client 無法 `select *` 掃到別人行程
- [ ] `/api/push/subscribe` 加入 `trip_secret` 驗證
- [ ] 修 `push/send` 的 `any`，讓 `npm run lint` 通過
- [ ] `generateToken` 改 crypto
- [ ] 加 `.env.example`、重寫 README
- [ ] `package.json` 加 `"test": "vitest run"`
- [ ] gitignore `*.log`
- [ ]（建議）分享連結改版，避免 secret 長期待在 query

---

## 附錄：關鍵檔案索引

| 用途 | 路徑 |
|------|------|
| 同步核心 | `src/context/TripContext.tsx` |
| 首頁 | `src/app/page.tsx` |
| 安全 headers / PWA | `next.config.ts` |
| RLS | `supabase/migrations/enable_rls.sql` |
| Push 訂閱 | `src/app/api/push/subscribe/route.ts` |
| Push 發送 | `src/app/api/push/send/route.ts` |
| 早安推播 Cron | `src/app/api/push/morning-reminder/route.ts` + `vercel.json` |
| CI | `.github/workflows/ci.yml` |
| 驗證 schema | `src/lib/validations.ts`, `src/lib/storage-schemas.ts` |

---

*本報告為靜態程式碼與本機 `tsc` / `eslint` / `vitest` 結果；未對 production Supabase 實際探測資料是否外洩。建議以匿名 key 在 SQL/REST 手動驗證 RLS 是否已生效。*
