import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor 設定檔
 *
 * 這個設定把現有的 Next.js PWA 包成 iOS/Android 混合 App，
 * 讓你可以使用 @capacitor/push-notifications 透過 APNs/FCM 收到原生等級推播。
 *
 * 使用流程：
 *   1. Web/後端部署到 Vercel，讓 App 用 server.url 載入同一個站
 *   2. `npx cap add android` 建立原生平台資料夾
 *   3. 放入 `android/app/google-services.json`
 *   4. `npx cap sync android` 同步設定
 *   5. `npx cap open android` 用 Android Studio 開啟
 *
 * 詳細設定步驟請見 PUSH_SETUP.md
 */
const config: CapacitorConfig = {
  appId: "com.tokyotrip.app",
  appName: "東京自由行",
  /**
   * 這個專案有 Next API routes，因此 Android App 以 WebView 載入正式站。
   * 如需本機測試 Android Emulator，可臨時設定：
   *   CAPACITOR_SERVER_URL=http://10.0.2.2:3000
   *   CAPACITOR_CLEAR_TEXT=true
   */
  webDir: "public",
  server: {
    url: process.env.CAPACITOR_SERVER_URL ?? "https://tokyo-trip-rosy.vercel.app",
    cleartext: process.env.CAPACITOR_CLEAR_TEXT === "true",
    androidScheme: "https",
  },
  plugins: {
    PushNotifications: {
      // iOS: 開機時自動請求權限的提示文字
      presentationOptions: ["badge", "sound", "alert"],
    },
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#e74c3c",
      showSpinner: false,
    },
  },
};

export default config;
