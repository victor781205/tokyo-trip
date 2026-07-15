import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { ThemeInitScript, ThemeProvider } from "@/components/ThemeProvider";
import { TripProvider } from "@/context/TripContext";
import { DialogProvider } from "@/context/DialogContext";
import { ErrorBoundary } from "@/components/ErrorBoundary";

const notoSansTC = Noto_Sans_TC({
  subsets: ["latin"],
  weight: ["400", "500", "700", "900"],
  variable: "--font-noto-sans",
});

const notoSerifTC = Noto_Serif_TC({
  subsets: ["latin"],
  weight: ["700", "900"],
  variable: "--font-noto-serif",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
});

const themeInitScript = `(function(){try{var t=localStorage.getItem("theme");if(t!=="light"&&t!=="dark"&&t!=="system")t="system";t=t||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.dataset.theme=t;r.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export const metadata: Metadata = {
  title: "東京自由行 9/1-9/6",
  description: "東京六天五夜行程規劃 - 航班、住宿、交通、景點、美食推薦",
  manifest: "/manifest.json",
  metadataBase: new URL("https://tokyo-trip-rosy.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "東京自由行 9/1-9/6 六天五夜行程規劃",
    description: "東京六天五夜行程規劃 - 航班、住宿、交通、景點、美食推薦",
    url: "https://tokyo-trip-rosy.vercel.app",
    siteName: "東京自由行",
    locale: "zh_TW",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "東京自由行 9/1-9/6 六天五夜行程規劃",
    description: "東京六天五夜行程規劃 - 航班、住宿、交通、景點、美食推薦",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "東京自由行",
  },
  icons: {
    apple: "/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // 系統 status bar / splash 配色依 prefers-color-scheme 切換
  // light = 品牌紅，dark = slate-900（搭配 manifest background_color）
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#c02f26" },
    { media: "(prefers-color-scheme: dark)", color: "#07111f" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning data-scroll-behavior="smooth" className="scroll-smooth">
      <head>
        <ThemeInitScript html={themeInitScript} />
      </head>
      <body className={`${notoSansTC.variable} ${notoSerifTC.variable} ${spaceGrotesk.variable} font-sans antialiased bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100 transition-colors duration-300`}>
        <ThemeProvider>
          <TripProvider>
            <ErrorBoundary>
              <DialogProvider>
                {children}
              </DialogProvider>
            </ErrorBoundary>
          </TripProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
