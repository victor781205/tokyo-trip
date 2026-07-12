# 健檢修補狀態（2026-07-10）

> 對應報告：
> - [`HEALTH_CHECK_REPORT.md`](HEALTH_CHECK_REPORT.md)
> - [`CATEGORY_UI_UX_HEALTH_CHECK_2026-07-10.md`](CATEGORY_UI_UX_HEALTH_CHECK_2026-07-10.md)
> - [`UI_UX_HEALTH_CHECK.md`](UI_UX_HEALTH_CHECK.md)

## 總結

程式面殘留的 P0/P1/P2 已收斂。2026-07-12 第二輪實跑 `npm run check` 全綠（23 files、94 tests），`npm run build` 亦成功。
Supabase secret 輪換 migration 的 production 套用紀錄見下方；其他環境仍須確認 migration 版本一致。

| 項目 | 狀態 | 說明 |
|------|------|------|
| 東京警察病院電話/地址 | ✅ 已修 | 中野 `+81-3-5343-5611` |
| 航班 LIVE 日期 gating | ✅ 已修 | TDX/AviationStack 先按班號與日期過濾，去回程來源分開 gating；錯日 gate/status/terminal/aircraft 不會滲入 |
| 航班狀態判讀 | ✅ 已修 | 改讀 TDX `DepartureRemark` / `ArrivalRemark`，取消與延誤不再誤標綠色準時 |
| Deep link hydration | ✅ 已修 | 初始 tab 固定 `hero`，client 再讀 query |
| 切 tab 捲動歸零 | ✅ 已修 | `scrollTo({ top: 0 })` + focus |
| JMA 今日高低溫 | ✅ 已修 | `parseTokyoForecast` |
| PackingList render side-effect | ✅ 已修 | 初始化改 `useEffect` |
| 美食假「預約」CTA | ✅ 已修 | disabled「預約未開放」 |
| 日語同義詞搜尋 | ✅ 已修 | 別名（如謝謝→感謝） |
| Supabase RLS 收斂 | ✅ SQL 已備 | 需 Dashboard 套用 `2026070903*` 系列 |
| Secret 輪換被 WITH CHECK 擋 | ✅ **production 已套用** | UPDATE policy 已放寬；另部署 `rotate_trip_secret` RPC（前端已改走 RPC） |
| map-info SSRF / redirect | ✅ 已修 | allowlist、manual redirect、timeout、512KB 上限、content-type |
| Heading 跳級 h2→h4 | ✅ 已修 | 活動名/卡片標題改 `p`；區塊標題改 `h3` |
| 分類頁主標題與觸控目標 | ✅ 已修 | 非首頁補隱藏 h1；手機主頁按鈕補至 44×44 |
| 巢狀 modal 鍵盤操作 | ✅ 已修 | modal stack 只讓最上層處理 Esc/Tab，最後一層關閉才解除捲動鎖 |
| 手機分類選單 | ✅ 已修 | 關閉鈕移入 focus trap；背景 nav 設 inert，避免誤觸與重複焦點 |
| 收據相機無法開啟 | ✅ 已修 | 先保存 MediaStream 再 mount video；關閉或延遲完成時皆停止 tracks |
| 預算超支／無效金額 | ✅ 已修 | 顯示實際超支額；拒絕 NaN、0、負數，出發前不做錯誤日均外推 |
| 匯率交換與資料時效 | ✅ 已修 | 移除失真的 swap；改每日參考匯率、24h server cache、上游更新時間與官方 attribution |
| 飯店／交通資料 | ✅ 已修 | 步行 3 分、巴士約 120 分、JR 約 85 分；更新 2026 Subway Ticket 與海外 Android Suica 限制 |
| 旅程時間軸 | ✅ 已修 | 起訖改用實際台北起飛／落地時間；Day N 統一按東京日曆日計算 |
| Token 熵 | ✅ 已修 | `secure-id` CSPRNG |
| 分享 secret 進 query | ✅ 已修 | 改 hash fragment + scrub |
| 雜訊檔 `$null` / `m[0])` | ✅ 清理 | 勿再提交 |
| 自動化測試（第一輪） | ✅ 擴充 | 14 files、58 tests；涵蓋航班日期隔離、JMA、巢狀 modal、相機生命週期、匯率、預算與旅程日期 |
| 跨行程同步快取 | ✅ 已修 | 改為依 `tripId` namespace；切換／錯誤分享連結不再沿用或覆寫上一趟資料 |
| 離線編輯合併 | ✅ 已修 | 只保留實際修改的 slice，乾淨 slice 接受遠端更新；重連、focus 與可見頁面定期補抓 |
| 分享建立競態 | ✅ 已修 | 新行程第一次雲端寫入前禁止複製連結；URL 憑證驗證成功後才取代原行程 |
| Vercel Cron 驗證 | ✅ 已修 | cron 使用純路徑與 `Authorization: Bearer CRON_SECRET`，正式環境拒絕 query secret |
| 路線／地圖失敗狀態 | ✅ 已修 | 自訂起點不再顯示飯店車資；Google Maps 缺 key、驗證失敗、網路錯誤與逾時皆可重試／外部開啟 |
| 美食／天氣狀態 | ✅ 已修 | 移除假「營業中」；URL 解析錯誤用站內 dialog；JMA 失敗有錯誤頁與重試 |
| 推播狀態提示 | ✅ 已修 | 必須同時有 permission、實際 subscription 與後端登記 marker 才顯示已開啟 |
| 過時行程內容 | ✅ 已修 | 豐洲改 teamLab Planets；移除已關閉台場摩天輪；11:00 退房、14:00 取寄放行李 |
| 第二輪手機觸控 | ✅ 已修 | 8 分類可見控制項皆達 44×44px，且無未命名控制項與水平 overflow |
| 自動化測試（第二輪） | ✅ 擴充 | 23 files、94 tests；新增同步隔離／Strict Mode、cron、地圖、狀態、內容與推播回歸 |

## 分類頁／UI UX 最終回歸

- 390×844：首頁、機票、美食、助手、行前準備、交通、行程、工具共 8 類，皆無 document 水平 overflow。
- 可及性：8 類可見的 button/link/input/select/textarea 未發現無名稱控制項；手機 menu focus trap、巢狀 modal 兩次 Esc、焦點與 body scroll lock 均通過。
- 功能：deep link、返回鍵、分類切換回頂與 focus、JMA 缺值、日語「謝謝」別名、預定航班模式、每日匯率與掃描器入口均通過。
- API smoke：旅程尚遠時 flight API 回傳 `isLive=false` 與 hardcoded itinerary fallback；currency API 使用上游實際更新時間。
- Runtime：最終瀏覽器回歸無 error-level console log。
- 第二輪 390×844：8 類各 1 個 h1、所有可見控制項具名稱且達 44×44px，無水平 overflow。
- 第二輪功能：自訂起點車資、Route/Food 地圖降級、Day 4/Day 6 內容、手機逐日切換皆實際通過。

## Production 已代為套用（2026-07-10）

已用 Management API 對 project `gepyasrufqyuaqagxmxd` 套用：

1. `20260710000000_allow_secret_rotation.sql` — UPDATE policy WITH CHECK 不再鎖死舊 secret
2. `20260710010000_rotate_trip_secret_rpc.sql` — `public.rotate_trip_secret(p_trip_id, p_old_secret, p_new_secret)`

**實測：**
- 正確 old secret → 輪換成功，new secret 可讀、old secret 不可讀
- 錯誤 old secret → `42501 forbidden`

前端 [`TripContext.rotateTripSecret`](src/context/TripContext.tsx) 已改呼叫 RPC（不再 upsert 改 secret）。

### 建議你再做

1. App 同步設定按一次「重新產生同步密碼」
2. 用新 hash 分享連結開第二裝置確認同步
3. **撤銷**本次提供的 Supabase Access Token（Account → Access Tokens）

## 驗證指令

```bash
npm run check   # typecheck + lint + test
npm run build   # 可選 production build
```

## 已知可接受殘餘

- 未在實體手機授予相機權限或上傳真實收據；相機串流成功、延遲完成與清理路徑已用 mock MediaStream 測試。
- 本機沒有 Supabase credentials，跨裝置仍需在有憑證的 staging 驗證。現行 RLS 依 REST `x-trip-secret`，WebSocket 無法攜帶該 header，因此前端另以 30 秒可見頁面輪詢、focus、visibility 與 reconnect 補抓；若要真正即時，後續需改成 Realtime 可驗證的 JWT/Auth 模型。
- 分享連結本質仍依賴持有 secret 的裝置；完整 invite token 流程屬後續強化。
- map-info 依賴上游 Google HTML 結構，解析失敗時維持既有的優雅降級。
