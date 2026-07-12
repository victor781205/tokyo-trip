# 東京自由行 · UI/UX 全站健檢報告

日期：2026-07-09
範圍：網頁版（desktop ≥1024）+ 手機版（含 iOS notch / Android 大螢幕）
同步功能：TripContext / 分享連結 / 推播 / 離線狀態

---

## 一、分類頁盤點

| Tab ID | 導覽標籤 | 組成元件 | 同步資料 | 主要能力 |
|--------|----------|----------|----------|----------|
| `hero` | 首頁 | Hero + Push | tripId/secret | 倒數、旅程階段、推播入口 |
| `flights` | 機票 | FlightInfo | 無（即時 API） | STARLUX 航班狀態 |
| `tripprep` | 行前準備 | Weather + PackingList | packing_list | JMA 天氣、行李勾選 |
| `transport` | 交通 | HotelInfo + RouteMap | itinerary（路線捷徑） | 接駁、路線查詢、地圖 |
| `itinerary` | 行程 | Itinerary | itinerary | 編輯、衝突、ICS 匯出、統計 |
| `food` | 美食 | Food | custom_foods | 分區/分類、地圖/清單、自訂 |
| `assistant` | 旅遊助手 | Emergency + Phrases + Tips | 無（靜態） | 緊急電話、日語、小提醒 |
| `tools` | 預算 | Budget + Currency | budget_* | 記帳、OCR 收據、匯率 |

同步欄位（`sync_state`）：`itinerary` · `budget_items` · `budget_limit` · `custom_foods` · `packing_list`

---

## 二、本次已修復（高優先）

### 1. 同步密碼輪換（安全善後）
- [`TripContext.tsx`](src/context/TripContext.tsx)：新增 `rotateTripSecret()`
  - 用舊 secret 通過 RLS 寫入新 secret
  - 重建 client + realtime
  - 舊分享連結立即失效
- [`Navigation.tsx`](src/components/Navigation.tsx) 同步 Modal：
  - 顯示 / 複製密碼
  - 「重新產生同步密碼」+ 確認對話框
  - 登入失敗錯誤訊息
  - 同步狀態 badge（已同步 / 離線 / 失敗）
  - 手機 bottom-sheet 風格（`items-end` + 最大高度可捲）

### 2. 離線指示器失效
- [`OfflineIndicator.tsx`](src/components/OfflineIndicator.tsx) 先前 `mobileOnly` 直接 `return null`，手機永遠看不到離線提示
- 改為 **web + mobile 皆顯示**，並加上 safe-area bottom

### 3. Tab URL 同步
- [`page.tsx`](src/app/page.tsx)：`?tab=` 與 `history.replaceState` 同步
- 支援重新整理、分享連結、推播 deep link、`popstate`
- Hero 導航亦走同一 handler

### 4. 間距 / 手機密度
- 天氣、行李、路線、Tips 的 `py-20` 過大，手機多區塊頁面會「又長又空」
- 調整為 `py-4 md:py-12` 等較合理的響應式間距
- 主內容區 `py-4 sm:py-6`

### 5. Git 衛生
- [`.gitignore`](.gitignore) 明確忽略 `.env.vercel*` / `.env.vercel.prod*`

### 6. Smoke 資料清理 SQL
- [`20260709042000_cleanup_smoke_data.sql`](supabase/migrations/20260709042000_cleanup_smoke_data.sql)（需在 Supabase SQL Editor 執行）

---

## 三、各頁面 UI/UX 觀察

### 網頁版（Desktop）
| 區域 | 狀態 | 說明 |
|------|------|------|
| 頂部導覽 | 良好 | 8 tab + 設定 + 主題，active 態清楚 |
| Hero | 良好 | 倒數視覺主軸、階段切換完整 |
| 行程 | 良好 | 時間軸 / 統計 / ICS / 衝突偵測 |
| 美食 | 良好 | 地圖+清單雙模式、自訂店家 |
| 預算 | 良好 | 分類、進度、OCR |
| 多區塊 tab | 可再優化 | tripprep / transport / tools / assistant 長頁需捲動，可加「頁內錨點」 |
| 同步 Modal | 已改善 | 密碼輪換 + 狀態 badge |

### 手機版（Mobile / PWA）
| 區域 | 狀態 | 說明 |
|------|------|------|
| Safe-area | 良好 | `.safe-top` / `.safe-bottom` / `dvh` / `svh` |
| 全螢幕選單 | 良好 | 3 欄大觸控、拇指區分享鈕 |
| 設定入口 | 良好 | 右上齒輪，觸控區 ≥ 44px |
| 離線提示 | **已修** | 先前手機看不到 |
| 同步 Modal | **已修** | 底部抽屜 + 可捲動，避免鍵盤/小螢幕裁切 |
| 地圖頁 | 注意 | RouteMap / Food 地圖高度需留意鍵盤彈出 |
| 長表單 | 注意 | 預算新增、美食自訂在小螢幕可再 sticky CTA |
| 緊急電話 | 良好 | `tel:` 一鍵撥號 |

---

## 四、功能同步檢查

| 功能 | 預期 | 現況 |
|------|------|------|
| 跨裝置行程同步 | RLS + x-trip-secret | ✅ 通過 smoke |
| 分享連結 | hash `#trip=&secret=` | ✅ 並 scrub URL |
| 登入其他行程 | Modal 表單 | ✅ 並顯示錯誤 |
| 輪換 secret | UI + 後端寫入 | ✅ **本次新增** |
| 推播訂閱 | RPC SECURITY DEFINER | ✅ |
| 離線編輯 | localStorage + 重連 | ✅ 指示器已修 |
| 打包清單同步 | packing_list | ✅ |
| 預算同步 | budget_* | ✅ |
| 自訂美食同步 | custom_foods | ✅ |
| Tab deep link | `?tab=` | ✅ **本次強化** |

---

## 五、建議新增功能（優先序）

### P1 · 建議近期做
1. **今日焦點（Today）**
   依日期自動展開「今天行程 + 天氣 + 附近美食 + 預算餘額」一卡，減少切 4 個 tab。
2. **行程 ↔ 美食 / 預算互連**
   從行程活動一鍵「加到預算」或「找附近餐廳」。
3. **分享時隱藏密碼顯示預設**
   已預設遮罩；可再加「僅複製連結、不顯示密碼」教學文案。
4. **推播：每日行程提醒預覽**
   在首頁顯示「明日 08:00 將推播 Day N」狀態。

### P2 · 體驗加分
5. **頁內錨點（複合 tab）**
   tripprep：天氣 | 行李；assistant：緊急 | 日語 | 提醒。
6. **行李一鍵重置 / 匯出 PDF**
7. **匯率快捷金額**（¥1000 / ¥5000 / ¥10000 點一下）
8. **日語常用句「收藏」**（可同步到 sync_state 新欄位）

### P3 · 進階
9. 離線地圖快取（Service Worker 策略）
10. 多人協作衝突 UI（last-write-wins 提示對方剛改過）
11. 費用分攤（兩人 AA）

---

## 六、仍需你手動執行

1. **Supabase SQL Editor** 執行：
   `supabase/migrations/20260709042000_cleanup_smoke_data.sql`
2. **建議立刻在 App 內「重新產生同步密碼」一次**（因先前 RLS 測試期間 secret 可能暴露過）
3. 重新複製分享連結給同伴

（`SERVICE_ROLE` 在 Vercel 可選；推播已走 SECURITY DEFINER RPC，不必再強塞 service key。）

---

## 七、結論

- 安全善後：輪換 secret UI + smoke 清理 SQL + gitignore 已到位
- 關鍵 UX bug：手機離線指示器、tab deep link、同步 Modal 可用性已修
- 各分類功能與同步欄位對齊，無「寫了不同步」的斷層
- 後續最值得做的是 **「今日焦點」** 與 **行程跨模組快捷操作**
