import type { Metadata, Viewport } from "next";
import { Noto_Sans_TC, Noto_Serif_TC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { TripProvider } from "@/context/TripContext";
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

export const metadata: Metadata = {
  title: "東京自由行 9/1-9/6",
  description: "東京六天五夜行程規劃 - 航班、住宿、交通、景點、美食推薦",
  manifest: "/manifest.json",
  metadataBase: new URL("https://tokyo-trip.vercel.app"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "東京自由行 9/1-9/6 六天五夜行程規劃",
    description: "東京六天五夜行程規劃 - 航班、住宿、交通、景點、美食推薦",
    url: "https://tokyo-trip.vercel.app",
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
  themeColor: "#e74c3c",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW" suppressHydrationWarning className="scroll-smooth">
      <body className={`${notoSansTC.variable} ${notoSerifTC.variable} font-sans antialiased bg-gray-50 text-gray-900 dark:bg-slate-900 dark:text-gray-100 transition-colors duration-300`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TripProvider>
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </TripProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
