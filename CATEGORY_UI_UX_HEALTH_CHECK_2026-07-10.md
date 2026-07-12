# 東京自由行：分類頁功能與 UI/UX 大健檢

> 日期：2026-07-10（Asia/Taipei）
> 範圍：首頁、機票、行前準備、交通、行程、美食、旅遊助手、預算
> 方法：原始碼檢查、桌機實際點擊、390×844 手機版、API smoke test、TypeScript / ESLint / Vitest / production build

## 總結

**健檢當下：C+ / 68 分。** 視覺層次、內容量、手機響應式和主要操作已具備可用水準。

> **修補狀態（2026-07-10 後續）：** 下列 P0/P1 已在程式碼修復。最新狀態見 [`HEALTH_CHECK_STATUS_2026-07-10.md`](HEALTH_CHECK_STATUS_2026-07-10.md)。

### 立即阻擋上線的問題（健檢當下；後續已修）

1. **緊急聯絡電話錯誤。** ~~文京錯誤號碼~~ → 已改中野 `+81-3-5343-5611`。
2. **航班 LIVE 與旅程日期不相符。** ~~無日期 gating~~ → 已加 `sourceDate` + `shouldFetchLiveFlight`。

## 自動化與執行結果

| 項目 | 結果 | 備註 |
|---|---:|---|
| TypeScript | ✅ | `npm run typecheck` 通過 |
| Vitest | ✅ | 5 files、34/34 tests 通過 |
| Production build | ✅ | 8 個 route 完成建置，PWA worker 產生成功 |
| ESLint | ❌ | 3 errors、1 warning |
| 390×844 響應式 | ✅ | 8 個分類均無 document 水平 overflow |
| Runtime console | ❌ | deep link hydration mismatch、PackingList render side effect、SW/離線提示 |
| Currency API | ✅ | HTTP 200；1 TWD = 5.0528 JPY（健檢當下） |
| Flight API | ⚠️ | HTTP 200，但資料日期與旅程日期不相符 |

ESLint 目前阻擋：

- `Food.tsx:229`：effect 內同步 setState。
- `TodayFocus.tsx:100`：effect 內同步 setState。
- `TodayFocus.tsx:160`：render/useMemo 期間呼叫 `Date.now()`，違反純函式規則。
- `TodayFocus.tsx:34`：未使用的 `TRIP_END` warning。

## 各分類頁面

| 分類 | 實測結果 | 主要問題 | 評級 |
|---|---|---|---:|
| 首頁 | 倒數、今日焦點、行程/預算/行李/美食/交通捷徑都可呈現 | 同頁同時顯示「52 天」與「53 天」；Hero 以 9/1 08:30 + floor 計算，TodayFocus 以 9/1 00:00 + ceil 計算 | 7/10 |
| 機票 | 去回程卡片、時間線、航廈與機型都能載入 | **P0：把 7/9 同班號的即時資料套到 9/1、9/6 行程**；LIVE 標籤失真 | 4/10 |
| 行前準備 | JMA 一週天氣、穿搭建議、44 項行李清單、匯出入口正常 | 今日溫度顯示 32–32°C；程式把 JMA `temps` 的時間序列誤當 max/min。PackingList 在 render 中排 setTimeout 更新 state，出現未掛載更新 warning | 7/10 |
| 交通 | 飯店資料、四種機場交通、快速車資、起終點與路線查詢均可見；點「澀谷 ¥230」會正確填入目的地 | 起終點交換 icon 無 accessible name；部分飯店設施（大浴場、健身房、洗衣）應再對官方訂房內容核對 | 8/10 |
| 行程 | 6 日導覽、時間線/統計、ICS/圖片匯出、編輯與加入預算入口正常；編輯 modal 可開啟並帶入資料 | modal 無 `role="dialog"` / `aria-modal`，關閉鈕缺 accessible name，表單 label 未與欄位關聯，無 Esc/focus trap | 8/10 |
| 美食 | 拉麵→壽司篩選實測成功，壽司卡片清單正確切換；區域、地圖、導航、私藏表單都有 | 3 個文字輸入只有視覺 label/placeholder，沒有程式化 label；「預約」按鈕看似可操作但沒有 handler，是假 CTA | 8/10 |
| 旅遊助手 | 緊急電話 `tel:`、日語分類/發音、搜尋、Tips 皆可操作；搜尋「感謝」可找到對應短語 | **P0：東京警察病院電話與地址錯誤**；搜尋只做字面包含，「謝謝」找不到「非常感謝」；醫療名單缺距飯店/24h/語言/急診狀態 | 3/10 |
| 預算 | 預算摘要、類別圖表、記帳表單、發票掃描入口、匯率與快捷換算正常；輸入 JPY 1000 得到 TWD 198 | 記帳 select/name/amount 缺程式化 label；掃描器 modal 缺 dialog semantics、Esc/focus trap；首頁小 CTA 只有 16px 高 | 8/10 |

## UI/UX 與可用性

### 做得好的地方

- 視覺語言一致：大圓角、層次、品牌紅、dark mode class、loading skeleton 與 empty state 都有規劃。
- 390px 手機版 8 個分類均未發現整頁水平 overflow；預算表單在 390px 可完整容納。
- 手機全螢幕 3×3 導覽清楚，開啟時會鎖定背景捲動。
- 主要 destructive action 多數已有自訂 confirm，而非直接刪除。
- 食物重型地圖、OCR、各分類元件採 dynamic import，首屏策略方向正確。

### P1 體驗問題

1. **切分類不重設捲動位置。** 從長頁切到另一分類會沿用舊 `scrollY`；實測從旅遊助手切到美食後直接落在頁尾「私藏清單」，完全跳過上方篩選和餐廳卡片。`page.tsx` 的 `handleSetActiveTab()` 只改 state / URL，沒有 scroll 或 focus 管理。
2. **deep link hydration mismatch。** `useState` initializer 在 server 回傳 `hero`、browser 則直接讀 `?tab=tools` 等 query；直接開分類網址會讓 server/client 樹不同，React 丟 hydration failed 並重建 client tree。健檢中多次穩定重現。
3. **頁面倒數口徑不一致。** Hero 與 TodayFocus 使用不同出發時間與 round 方法，同頁相差一天。
4. **今日天氣 max/min 誤讀。** JMA payload 的 current-day `temps` 是帶 `timeDefines` 的時點資料，不能直接用 `[1]`/`[0]` 當最高/最低溫；兩個首頁元件都用了相同錯誤邏輯。
5. **假操作元件。** 美食卡片的「預約」按鈕沒有 click 行為，會破壞使用者信任。

### 無障礙與鍵盤操作

- 桌機設定、桌機/手機主題切換、手機 menu icon 沒有 `aria-label`，DOM snapshot 只讀到空白 button。
- Food 與 Budget 的多個 label 只是相鄰文字，沒有 `htmlFor`/`id`；screen reader 讀不到欄位用途。
- Itinerary 與 ReceiptScanner modal 缺 dialog semantics、焦點限制與 Esc 關閉；Navigation 同步 modal 雖有 ARIA，但仍缺 focus trap / Esc。
- 行前準備、行程、美食、旅遊助手存在 heading level 跳級（例如 h2 → h4）。
- 首頁「詳情／設定／前往」觸控目標約 24×16px，低於建議尺寸。

## 建議修正順序

### P0（今天修）

1. 將東京警察病院改為 `東京都中野区`、`+81-3-5343-5611`；同時把醫院清單改成官方來源、顯示最後核對日期。
2. 航班 API 回傳 `sourceDate`，前端必須比對旅程日期；距出發尚遠時只顯示「預定航班／航廈」，不要顯示 gate、status、LIVE。建議只在出發前 24–48 小時啟用即時卡片。

### P1（下一版）

3. 修正 deep link 初始化，使 server/client 使用相同初始 tab；分類切換後 `scrollTo({top:0})` 並把焦點移到新頁 h1/h2。
4. 依 JMA schema 正確組合今日 high/low，無可靠最低溫時顯示 `—`，不要造出 32–32°C。
5. 將 PackingList 初始化移到 effect，清掉 3 個 lint error，恢復 `npm run check` 全綠。
6. 統一 Hero / TodayFocus 的出發時間與天數 rounding。

### P2（體驗清理）

7. 補 icon button accessible names、表單 `htmlFor/id`、modal dialog/focus/Escape。
8. 「預約」接正式 URL/流程，或在未完成前改成 disabled +「即將推出」。
9. 日語搜尋加入同義詞（謝謝→感謝）或 fuzzy matching。
10. 補 component/API/E2E tests：deep link、分類切換 scroll、航班日期 gating、天氣 parser、緊急電話資料、手機 menu、modal keyboard flow。

## 官方資料核對

- [東京警察病院交通資訊](https://www.keisatsubyoin.or.jp/access/)：東京都中野区中野4-22-1，03-5343-5611。
- [JNTO Japan Visitor Hotline](https://www.japan.travel/en/plan/hotline/)：警察 110、消防/救護 119、旅客熱線 050-3816-2787。
- [台北駐日經濟文化代表處聯絡方式](https://www.roc-taiwan.org/jp_ja/post/43.html)：代表號 03-3280-7811（此筆現有資料正確）。
- [JMA 東京 forecast JSON](https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json)：current-day 溫度需搭配 `timeDefines` 解讀，weekly 才提供 `tempsMin` / `tempsMax`。

## 本輪未做的事

- 未修改任何產品來源邏輯或覆蓋既有未提交變更；本輪新增這份報告。執行 production build 時，`public/` 內的 PWA worker / fallback 雜湊產物有依目前版本重新產生。
- 未允許相機權限、未上傳真實收據、未撥出電話、未送出或刪除使用者資料。
- local `.env` 沒有 Supabase credentials，因此同步狀態只驗證到「離線模式」UI；Realtime 多裝置同步需另做有憑證的 staging E2E。
