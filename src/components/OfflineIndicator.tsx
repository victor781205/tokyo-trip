"use client";

import { WifiOff, CloudOff, Loader2 } from "lucide-react";
import { useTrip } from "@/context/TripContext";

/**
 * 全裝置同步狀態指示器。
 * 先前 connecting/offline 被設成 mobileOnly 且直接 return null，
 * 導致手機永遠看不到離線提示 — 這裡改為 web/mobile 皆顯示。
 */
export function OfflineIndicator() {
  const { syncStatus, syncError } = useTrip();

  if (syncStatus === "online") return null;

  const config = {
    connecting: {
      icon: Loader2,
      text: "同步中…",
      bg: "bg-blue-50/95 dark:bg-blue-900/40 border-blue-200 dark:border-blue-800",
      textColor: "text-blue-700 dark:text-blue-300",
      iconClass: "animate-spin",
    },
    offline: {
      icon: WifiOff,
      text: "離線模式 · 變更會暫存在本機",
      bg: "bg-amber-50/95 dark:bg-amber-900/40 border-amber-200 dark:border-amber-800",
      textColor: "text-amber-800 dark:text-amber-300",
      iconClass: "",
    },
    error: {
      icon: CloudOff,
      text: syncError || "同步失敗 · 請檢查網路後重試",
      bg: "bg-red-50/95 dark:bg-red-900/40 border-red-200 dark:border-red-800",
      textColor: "text-red-700 dark:text-red-300",
      iconClass: "",
    },
  } as const;

  const { icon: Icon, text, bg, textColor, iconClass } = config[syncStatus];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-[calc(1rem+var(--sab))] left-1/2 -translate-x-1/2 z-50 ${bg} border rounded-2xl px-4 py-2.5 sm:px-5 sm:py-3 flex items-center gap-2.5 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300 max-w-[min(92vw,24rem)]`}
    >
      <Icon className={`w-4 h-4 sm:w-5 sm:h-5 shrink-0 ${textColor} ${iconClass}`} />
      <span className={`text-xs sm:text-sm font-bold ${textColor}`}>{text}</span>
    </div>
  );
}