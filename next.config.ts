import type { NextConfig } from "next";
import withPWAInit from "next-pwa";

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  // 排除大型靜態資源以避免 iOS Safari SW 安裝逾時
  // 字型檔 (~200 個 woff2) 和 API route chunks 不需要 precache
  buildExcludes: [
    /\.woff2$/i,
    /chunks\/app\/api\//,
  ],
  fallbacks: {
    document: "/offline.html",
  },
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "supabase-api",
        expiration: { maxEntries: 50, maxAgeSeconds: 60 * 30 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      // open.er-api.com 是 currency/route.ts 用的匯率 API；offline 時 SWR 給上次快取
      urlPattern: /^https:\/\/open\.er-api\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "currency-api",
        expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 },
      },
    },
    {
      urlPattern: /^https:\/\/tdx\.transportdata\.tw\/.*/i,
      handler: "NetworkFirst",
      options: {
        cacheName: "transport-api",
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 10 },
        networkTimeoutSeconds: 10,
      },
    },
    {
      urlPattern: /^https:\/\/.*\.tile\.openstreetmap\.org\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "map-tiles",
        expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
      },
    },
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
      handler: "StaleWhileRevalidate",
      options: { cacheName: "google-fonts-stylesheets" },
    },
    {
      urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
      handler: "CacheFirst",
      options: {
        cacheName: "google-fonts-webfonts",
        expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
      },
    },
  ],
});

// Security Headers Configuration
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "0" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://maps.googleapis.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com",
      "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://maps.googleapis.com https://maps.google.com https://maps.gstatic.com https://*.gstatic.com https://images.unsplash.com",
      "font-src 'self' https://fonts.gstatic.com https://unpkg.com",
      "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://tdx.transportdata.tw https://api.currencyapi.net https://api.aviationstack.com https://maps.googleapis.com https://maps.googleapis.cn https://fonts.googleapis.com https://open.er-api.com https://www.jma.go.jp",
      "frame-src 'self' https://www.google.com https://maps.google.com https://www.google.com/maps",
      "frame-ancestors 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  turbopack: {},
  // 顯式把 NEXT_PUBLIC_* 透過 Next 的 env 機制 inline 進 client bundle
  // （避免 dynamic + ssr:false 元件 build-time 沒替換到 process.env）

  /*
   * TypeScript / ESLint build 檢查已恢復嚴格模式。
   * 之前因專案內 4 個既存型別錯誤而暫時開啟 ignoreBuildErrors，
   * 現在那些錯誤已全部修掉（capacitor.config.bundledWebRuntime、
   * morning-reminder Supabase distinct、usePushNotifications report 參數、
   * firebase-admin import 路徑），故移除此開關以恢復嚴格型別檢查。
   */
  env: {
    NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default withPWA(nextConfig);
