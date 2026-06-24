"use client";

import { Wifi, WifiOff, CloudOff, Loader2 } from "lucide-react";
import { useTrip } from "@/context/TripContext";

export function OfflineIndicator() {
  const { syncStatus } = useTrip();

  if (syncStatus === "online") return null;

  const config = {
    connecting: {
      icon: Loader2,
      text: "同步連線中...",
      bg: "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800",
      textColor: "text-blue-700 dark:text-blue-400",
      iconClass: "animate-spin",
    },
    offline: {
      icon: WifiOff,
      text: "離線模式 — 資料僅儲存於本機",
      bg: "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800",
      textColor: "text-amber-700 dark:text-amber-400",
      iconClass: "",
    },
    error: {
      icon: CloudOff,
      text: "同步失敗 — 請檢查網路連線",
      bg: "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800",
      textColor: "text-red-700 dark:text-red-400",
      iconClass: "",
    },
  } as const;

  const { icon: Icon, text, bg, textColor, iconClass } = config[syncStatus];

  return (
    <div className={`fixed bottom-4 left-4 right-4 z-50 max-w-md mx-auto ${bg} border rounded-2xl px-5 py-3 flex items-center gap-3 shadow-lg backdrop-blur-sm animate-in fade-in slide-in-from-bottom-4 duration-300`}>
      <Icon className={`w-5 h-5 shrink-0 ${textColor} ${iconClass}`} />
      <span className={`text-sm font-bold ${textColor}`}>{text}</span>
    </div>
  );
}
