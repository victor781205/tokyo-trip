# Sentry 設定指南

## 快速設定 (5 分鐘完成)

### 步驟 1: 創建 Sentry 帳號
1. 前往 https://sentry.io
2. 點擊 "Start Free" 或 "Sign Up"
3. 使用 GitHub 登入（推薦）或 Email 註冊

### 步驟 2: 建立新專案
1. 登入後，點擊 "Projects" → "Create Project"
2. 選擇框架: **Next.js**
3. 專案名稱: `tokyo-trip`
4. 點擊 "Create Project"

### 步驟 3: 複製 DSN
建立專案後，你會看到類似這樣的內容：

```
// 複製這個 DSN
https://xxxxx@sentry.io/xxxxx
```

### 步驟 4: 設定環境變數

#### 開發環境 (.env.local)
```bash
# 在專案根目錄執行
echo "NEXT_PUBLIC_SENTRY_DSN=https://xxxxx@sentry.io/xxxxx" >> .env.local
```

#### Vercel 部署
```bash
# 使用 Vercel CLI
vercel env add NEXT_PUBLIC_SENTRY_DSN

# 或在 Vercel Dashboard:
# Settings → Environment Variables → Add Variable
# Name: NEXT_PUBLIC_SENTRY_DSN
# Value: https://xxxxx@sentry.io/xxxxx
# Environments: Production, Preview, Development (全部勾選)
```

### 步驟 5: 重新部署
```bash
vercel --prod
```

---

## 🎉 完成！

設定完成後，你可以在 Sentry Dashboard 看到：

- **Issue Stream**: 即時錯誤報告
- **Performance**: API 效能監控
- **Releases**: 部署追蹤

---

## 驗證設定

在瀏覽器 console 輸入測試錯誤：

```javascript
throw new Error('Sentry 測試錯誤');
```

如果你在 Sentry 看到這個錯誤，代表設定成功！

---

## 進階功能 (可選)

### 1. 設定 Alert Rules
- 當錯誤發生時發送 Slack/Email 通知
- 路徑: Project → Alerts → Create Alert Rule

### 2. 連結 GitHub
- 自動關聯錯誤到對應的 commit
- 路徑: Project → Releases → Connect Repo

### 3. 設定 Source Maps
Sentry 會自動處理，確保 `sentry.properties` 存在

---

## 常見問題

### Q: 看不到錯誤？
- 確認 DSN 設定正確
- 確認環境變數已生效
- 檢查瀏覽器 Network 分頁確認有請求發出

### Q: 延遲或效能問題？
- `tracesSampleRate: 0.1` 表示只追蹤 10% 的請求
- 生產環境足夠，不需要提高

### Q: 想停用 Sentry？
- 移除 `NEXT_PUBLIC_SENTRY_DSN` 環境變數
- 或設為空值