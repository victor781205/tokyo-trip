# 美食頁「我的私藏名單」同步健檢報告

> 日期：2026-07-11
> 專案：`C:\Users\Victor\tokyo-trip`
> 範圍：`Food` 私藏美食（`custom_foods`）跨裝置 / 重整 / 離線同步

---

## 1. 資料流總覽

| 層級 | 位置 | 角色 |
|------|------|------|
| UI | [`src/components/Food.tsx`](src/components/Food.tsx) | 新增 / 編輯 / 刪除私藏 |
| Hook | [`src/hooks/useTripState.ts`](src/hooks/useTripState.ts) | `customFoods` / `updateCustomFoods` |
| 狀態 + 同步 | [`src/context/TripContext.tsx`](src/context/TripContext.tsx) | localStorage + Supabase `sync_state.custom_foods` |
| Schema | [`src/lib/storage-schemas.ts`](src/lib/storage-schemas.ts) | `customFoodsSchema` |
| 雲端表 | `public.sync_state` | 整包 JSON 欄位 last-write-wins |

同步模型：**整包 upsert**（itinerary / budget / custom_foods / packing 一次寫入），衝突策略為 **timestamp last-write-wins**。

---

## 2. 根因分析（為什麼「常常無法資料同步」）

### 🔴 P0 — 遠端套用只改 React state，不寫 localStorage

**舊行為：** `connectToTrip` / Realtime `UPDATE` 收到雲端資料時呼叫 `_setCustomFoods(...)`，**沒有** `localStorage.setItem("tokyoCustomFoods", ...)`。

**症狀：**

1. A 裝置新增私藏 → 雲端有資料。
2. B 裝置即時看到（或重整後短暫看到）。
3. B 再重整：hydrate 先讀 **舊的 localStorage** → 私藏「消失」。
4. 若本機時間戳被當成較新，還可能把**空/舊名單推回雲端**，A 的資料也被蓋掉。

這是私藏名單「有時在、有時不在」的最主要原因。

### 🔴 P0 — `hasLocalData` 時用 `Date.now()` 假裝本機較新

**舊行為：**

```ts
if (hasLocalData && !hasUrlCredentials) {
  lastUpdateRef.current = Date.now();
}
```

只要本機有任何行程/預算/美食/打包資料，啟動當下時間戳就壓過雲端 `updated_at`。

**症狀：**

- 手機剛清過快取、只有預設行程；筆電上有完整私藏。
- 手機開啟後認為自己比較新 → **不拉雲端**，2 秒後把本機空 `custom_foods` upsert 上去。
- 看起來像「同步失敗 / 名單被洗掉」。

### 🟠 P1 — 離線修改後上線，不一定會 push

**舊行為：** push 只在 state dependency 變更時 debounce 2s 觸發；`online` 事件只 `connectToTrip`。若重連後判定本機較新但 **state 沒再變**，就不會上送。

**症狀：** 捷運離線加私藏 → 回飯店有網路 → 畫面有資料、雲端沒有 → 另一台永遠看不到。

### 🟠 P1 — Food CRUD 使用 stale array 覆寫

**舊行為：**

```ts
updateCustomFoods([{ ...formData, id }, ...customFoods]);
```

若在 confirm 刪除 / 連點新增期間，Realtime 已更新 `customFoods`，closure 仍是舊陣列 → 後寫者整包蓋掉對方剛同步進來的項目。

### 🟡 P2 — 同步中仍可操作表單

`isLoaded === false` 時 `customFoods` 可能是 `[]`，使用者若此時新增，會以空陣列 + 1 筆作為「最新本機」上送，提高覆蓋雲端風險。

### 🟡 P2 — 失敗幾乎靜默

push `error` 只 `console.warn`，UI 常仍顯示「已同步」或很快回到 online；使用者以為同步成功。

### 🟡 P2 — 整包 LWW 無欄位級合併

兩人同時改：A 加私藏、B 改預算；後寫者整包覆寫，先寫者的欄位變更可能遺失。屬架構限制，非美食專用 bug，但會放大「名單不見」體感。

### 🟢 非主因

| 項目 | 說明 |
|------|------|
| Zod schema | `customFoodsSchema` 合理；遠端髒資料會 fail 並略過，不致整頁崩潰 |
| RLS | 近期 migration 已改 secret header；權限錯誤會 push fail，屬環境問題 |
| Food 推薦清單 | 靜態 `RECOMMENDED_FOODS`，與私藏同步無關 |

---

## 3. 已實作修復（2026-07-11）

### 3.1 [`TripContext.tsx`](src/context/TripContext.tsx)

| 修復 | 說明 |
|------|------|
| `tokyoLocalUpdatedAt` | 持久化本機最後變更時間，**不再**用 `Date.now()` 假裝有本地資料就較新 |
| `applyRemoteSnapshot` | 遠端資料同時寫入 React state **與** localStorage，並做 zod 驗證 |
| `pendingPushRef` + `pushTick` | 標記待上送；重連後強制 flush |
| push 僅在 pending | 避免 hydrate / 遠端套用後無意義覆寫雲端 |
| `stateRef` | push 讀最新快照，降低 debounce 期間 stale closure |
| functional setters | `setCustomFoods(prev => ...)` 支援，CRUD 可安全合併 |
| 升級相容 | 無 `tokyoLocalUpdatedAt` 但有舊本地資料時用 `ts=1`：雲端有真實時間仍會贏 |
| push 失敗 | 設 `syncStatus = "error"`，UI OfflineIndicator 可見 |

### 3.2 [`Food.tsx`](src/components/Food.tsx)

| 修復 | 說明 |
|------|------|
| functional update | 新增 / 編輯 / 刪除皆 `updateCustomFoods(prev => ...)` |
| `isLoaded` 閘門 | 同步完成前禁用提交；空狀態不顯示「還沒有私藏」 |
| loading 提示 | 「同步私藏名單中…」 |

### 3.3 驗證

- `npx tsc --noEmit`：通過

---

## 4. 修復後預期行為

```
開啟 App
  → 讀 localStorage（含 tokyoLocalUpdatedAt）
  → 連 Supabase 比對 updated_at
  → remote 較新：套用並寫回 localStorage（含私藏）
  → local 較新：保留本機並 pending push
  → 2s 後 upsert 整包（僅 pending 時）

使用者加私藏
  → functional update + localStorage + markLocalMutation
  → debounce push → 雲端 updated_at 更新
  → 他裝置 Realtime / 重整 → applyRemoteSnapshot → 名單一致
```

---

## 5. 建議手動回歸（約 10 分鐘）

1. **雙裝置同步**
   - 裝置 A 加 2 筆私藏 → 等「已同步」
   - 裝置 B 重整 → 應看到 2 筆

2. **重整不丟資料**
   - B 看到後再重整 2 次 → 仍在（localStorage 與雲端一致）

3. **離線上送**
   - 飛航模式加 1 筆 → 關閉飛航 → 約 2s 後雲端有資料

4. **舊 bug 不再覆蓋**
   - A 有完整名單；B 清 site data 後開同一分享連結 → 應拉雲端，不可把空名單推回

5. **同步中不可搶寫**
   - 慢網路下美食頁應顯示同步中，提交鈕 disabled

---

## 6. 後續建議（未做）

| 優先 | 項目 |
|------|------|
| P1 | 欄位級 merge 或 per-slice `updated_at`，降低整包 LWW 互蓋 |
| P1 | push 失敗重試佇列（指數退避），不要只等下次 state 變更 |
| P2 | Capacitor 用 `@capacitor/preferences` 取代純 localStorage（iOS WKWebView 配額） |
| P2 | `PackingList` 預設清單自動寫入可能同樣觸發整包 push，建議一併 functional + 延後到 isLoaded |
| P3 | TripContext 單元測試（mock Supabase）覆蓋 remoteWins / localWins / offline flush |
| P3 | 同步衝突 toast：「已從雲端更新私藏名單」 |

---

## 7. 追加修復（2026-07-11 晚）— 上傳變更失敗 RLS

### 症狀

UI 紅字：`上傳變更失敗: new row violates row-level security policy for table "sync_state"`

### 根因

1. 前端以 `.from("sync_state").upsert(..., { onConflict: "id" })` 上送。
2. 在 **FORCE RLS** 下，PostgREST upsert 會先走 **INSERT WITH CHECK**；既有 row 但 SELECT 因 secret 不符看不到時，也會像「新列」一樣失敗。
3. 錯誤訊息固定是 `new row violates…`，與真正的「密碼錯誤 / INSERT 被擋」難以區分。
4. 這與先前 `rotate_trip_secret` 必須改 SECURITY DEFINER RPC 是同一類問題。

### 修復

| 項目 | 說明 |
|------|------|
| Migration | [`supabase/migrations/20260711070000_upsert_sync_state_rpc.sql`](supabase/migrations/20260711070000_upsert_sync_state_rpc.sql) — `public.upsert_sync_state(...)` |
| 前端 | [`src/context/TripContext.tsx`](src/context/TripContext.tsx) 優先 `rpc("upsert_sync_state")`；若 RPC 未部署（`PGRST202`）則 **UPDATE → INSERT → upsert** fallback |
| 錯誤文案 | secret 不符 / RLS →「行程密碼不符或已在其他裝置輪換。請用最新分享連結重新進入。」 |
| 行為 | 無列 → INSERT；有列且 secret 吻合 → UPDATE 內容（不改 secret）；secret 不符 → `forbidden` / 友善錯誤 |
| 測試 | regression 5/5 含 RPC 成功、權限失敗、RPC 缺失 fallback |

### 部署狀態（2026-07-11）

| 項目 | 狀態 |
|------|------|
| 前端 production | **已部署** `https://tokyo-trip-rosy.vercel.app`（bundle 已含 `upsert_sync_state` + fallback + 友善錯誤） |
| 正確 secret 表寫入 | **可用**（live probe：INSERT/UPDATE OK） |
| 錯誤 secret | 仍拒絕（預期）；UI 改顯示友善訊息 |
| `upsert_sync_state` RPC 於 Supabase | **尚未套用**（本機無 `DATABASE_URL` / `SUPABASE_ACCESS_TOKEN`；Vercel 拉到的 `SUPABASE_SERVICE_ROLE_KEY` 為空，無法 DDL） |

**目前可不依賴 RPC 正常上送**（fallback 路徑）。仍建議在 Supabase SQL Editor 執行 `20260711070000_upsert_sync_state_rpc.sql` 作為正式路徑。

### 若仍看到「上傳變更失敗」

多半是 **本機 secret 與雲端不符**（他裝置輪換過 / 舊分享連結）。請用最新分享連結重新進入，不要只重整。

---

## 8. 結論

私藏名單「常常無法同步」**不是** Food 表單單點 bug，而是 **TripContext 同步層多個互相加強的缺陷**：

1. 遠端資料不落盤
2. 本機時間戳錯誤膨脹
3. 離線重連不 flush
4. **PostgREST upsert + FORCE RLS / 過期 secret 造成「上傳變更失敗」**（本追加修復）

同步核心、Food CRUD、上送 fallback 已上 production；RPC migration 檔已備妥，待有 DB 權限時在 Dashboard 一鍵套用即可。
