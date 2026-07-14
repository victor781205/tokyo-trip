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

export function createContentSecurityPolicy(
  isDevelopment = process.env.NODE_ENV === "development",
  sentryDsn = process.env.NEXT_PUBLIC_SENTRY_DSN,
) {
  const scriptSources = [
    "'self'",
    "'unsafe-inline'",
    "'wasm-unsafe-eval'",
    ...(isDevelopment ? ["'unsafe-eval'"] : []),
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
  ];
  let sentryOrigin: string | null = null;
  if (sentryDsn) {
    try {
      const parsed = new URL(sentryDsn);
      if (parsed.protocol === "https:") sentryOrigin = parsed.origin;
    } catch {
      // Invalid optional DSNs disable Sentry transport without widening CSP.
    }
  }
  const connectSources = [
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
    "https://maps.googleapis.com",
    "https://maps.gstatic.com",
    ...(sentryOrigin ? [sentryOrigin] : []),
  ];

  return [
    "default-src 'self'",
    `script-src ${scriptSources.join(" ")}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://*.basemaps.cartocdn.com https://maps.googleapis.com https://maps.google.com https://maps.gstatic.com https://*.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com",
    `connect-src ${connectSources.join(" ")}`,
    "worker-src 'self' blob:",
    "media-src 'self' blob:",
    "manifest-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

// Security Headers Configuration
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-XSS-Protection", value: "0" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet, noimageindex" },
  {
    key: "Permissions-Policy",
    value: "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=(), fullscreen=(self)",
  },
  {
    key: "Content-Security-Policy",
    value: createContentSecurityPolicy(),
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
