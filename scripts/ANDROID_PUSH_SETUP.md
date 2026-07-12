# Android 推播設定

目前專案已完成：

- `@capacitor/android` 已安裝
- `android/` 原生專案已產生
- `@capacitor/push-notifications` 已同步到 Android
- `android/app/build.gradle` 已有 `google-services` plugin 自動套用邏輯
- `AndroidManifest.xml` 已加入 `POST_NOTIFICATIONS`
- App 會以 `https://tokyo-trip.vercel.app` 作為 WebView 入口

## 還需要你從 Firebase 補的檔案

1. 到 Firebase Console 建立或選擇專案
2. 新增 Android App
   - Package name: `com.tokyotrip.app`
   - App nickname 可填 `Tokyo Trip Android`
3. 下載 `google-services.json`
4. 放到：

```text
android/app/google-services.json
```

## 後端發送推播需要的環境變數

從 Firebase Console 的服務帳戶產生 private key，然後設定到 `.env.local` 與 Vercel：

```text
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
SUPABASE_SERVICE_ROLE_KEY=...
```

如果你下載的是 `firebase-service-account.json`，可以用工具轉成 env 格式：

```bash
npm run firebase:env -- firebase-service-account.json
```

## 本機 Android build 工具

這台機器目前缺 `JAVA_HOME` / `java`，所以 `android/gradlew.bat assembleDebug` 會失敗。

安裝 Android Studio 後，設定：

```text
JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk
```

再執行：

```bash
npx cap sync android
cd android
.\gradlew.bat assembleDebug
```
