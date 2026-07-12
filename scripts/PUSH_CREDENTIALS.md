# 推播憑證放置說明

本檔案說明 Capacitor + FCM 方案所需的推播憑證要放在哪裡。
所有真實憑證都已被 `.gitignore` 排除，**切勿提交到 Git**。

---

## 1. Firebase Admin（後端 Next.js API Route 用）

放到專案根目錄的 `firebase-service-account.json`。
從 Firebase Console → 專案設定 → 服務帳戶 → 「產生新的私密金鑰」下載。

環境變數（建議改用環境變數，避免放實體檔案）：

```
# .env.local（本機）或 Vercel 環境變數
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

---

## 2. Android — google-services.json

放到 `android/app/google-services.json`

從 Firebase Console → 專案設定 → Cloud Messaging → Android 應用程式 → 下載 `google-services.json`。

執行後 `npx cap add android` 會建立 `android/` 資料夾，再把檔案丟進 `android/app/`。

---

## 3. iOS — GoogleService-Info.plist

放到 `ios/App/App/GoogleService-Info.plist`

從 Firebase Console → 專案設定 → Cloud Messaging → iOS 應用程式 → 下載 `GoogleService-Info.plist`。

執行 `npx cap add ios` 建立後，再用 Xcode 把這個 plist 拖進 `App` target（勾選 "Copy items if needed"）。

---

## 4. APNs Auth Key（.p8）— iOS 推播要用

從 Apple Developer → Certificates, Identifiers & Profiles → Keys → 建立 APNs Auth Key。
下載後的 `AuthKey_XXXXXXXXXX.p8` 請保留，並在 Firebase Console → 專案設定 → Cloud Messaging → iOS 上傳這把 key。

---

## 流程總覽

```mermaid
flowchart LR
  A[行程提醒排程] --> B[Next.js API Route /api/push]
  B --> C[firebase-admin admin.messaging]
  C --> D[FCM]
  D --> E[iOS APNs → App]
  D --> F[Android FCM → App]
```
