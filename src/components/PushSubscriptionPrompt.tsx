"use client";

import { useState } from "react";
import { Bell, BellOff, CheckCircle2, Loader2, Send } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";
import { getPushCapabilitySnapshot, isIOSBrowser, isStandaloneWebApp } from "@/lib/platform";

interface Props {
  tripId?: string;
  tripSecret?: string;
}

const REGISTER_TIMEOUT_MS = 30000;
const PUSH_UI_VERSION = "push-ui-20260706-8";

/**
 * 推播訂閱按鈕元件
 *
 * - 在原生 App（Capacitor）中：呼叫 PushNotifications.register() 走 FCM/APNs
 * - 在 PWA Web 中：要求 Notification 權限 + 用 VAPID 訂閱 Web Push
 *
 * 顯示四種狀態：idle / loading / granted / denied / unsupported
 */
export function PushSubscriptionPrompt({ tripId, tripSecret }: Props) {
  const push = usePushNotifications(tripId, tripSecret);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [unregistering, setUnregistering] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  const handleRegister = async () => {
    setLoading(true);
    setHint(null);

    if (isIOSBrowser() && !isStandaloneWebApp()) {
      setLoading(false);
      setHint("iPhone 需要先用 Safari 分享選單加入主畫面，再從主畫面開啟後才能啟用推播。");
      return;
    }

    let result = null;
    try {
      result = await withTimeout(push.register(), REGISTER_TIMEOUT_MS);
    } catch (error) {
      console.warn("[push] register failed", error);
      setHint(formatPushError(error, getPushCapabilitySnapshot()));
      result = null;
    } finally {
      setLoading(false);
    }

    if (!result) {
      setHint((current) => current ?? `無法註冊推播，請檢查權限、網路，或重新從主畫面開啟 PWA 後再試。${formatDiagnostics(getPushCapabilitySnapshot())}`);
    } else if (push.current === "web") {
      setHint("已開啟推播，請加到主畫面以確保完整收到通知。");
    } else {
      setHint("已開啟推播！");
    }
  };

  const handleTest = async () => {
    if (!tripId || !tripSecret) {
      setHint("尚未取得行程代號，請稍後再試。");
      return;
    }

    setTesting(true);
    setHint(null);
    try {
      const res = await fetch("/api/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          trip_secret: tripSecret,
          title: "東京行程測試提醒",
          body: "推播已經接通，之後每日行程提醒會用同一條通道送出。",
          data: { type: "test-reminder", url: "/?tab=itinerary" },
        }),
      });
      const json = await res.json().catch(() => ({})) as { sent?: number; error?: string };
      if (!res.ok) throw new Error(json.error ?? "測試推播失敗");
      setHint(json.sent && json.sent > 0 ? "測試推播已送出。" : "測試完成，但目前沒有可發送的訂閱。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "測試推播失敗。");
    } finally {
      setTesting(false);
    }
  };

  const handleUnregister = async () => {
    setUnregistering(true);
    setHint(null);
    try {
      await push.unregister();
      setHint("已關閉這台裝置的行程推播。");
    } catch (error) {
      setHint(error instanceof Error ? error.message : "取消推播失敗，請稍後再試。");
    } finally {
      setUnregistering(false);
    }
  };

  if (push.current === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <BellOff className="w-4 h-4" />
        <span>此裝置不支援推播</span>
      </div>
    );
  }

  if (push.permission === "denied") {
    const guidance = push.current === "native"
      ? "請到手機「設定」→「通知」→ 找到 Tokyo Trip，開啟允許通知，再回到 App。"
      : isIOSBrowser() && isStandaloneWebApp()
        ? "請到 iPhone「設定」→「通知」→ 找到這個主畫面 App，開啟允許通知，再回來重新整理。"
        : "請點網址列左側的網站資訊圖示，進入網站設定，把「通知」改為允許，再重新整理本頁。";

    return (
      <div role="note" className="max-w-md rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left dark:border-amber-800 dark:bg-amber-950/30">
        <div className="flex items-center gap-2 text-sm font-black text-amber-900 dark:text-amber-200">
          <BellOff aria-hidden="true" className="w-4 h-4 shrink-0" />
          推播權限已被封鎖
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-900 dark:text-amber-100">{guidance}</p>
      </div>
    );
  }

  if (push.permission === "granted" && push.registered) {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400">
          <CheckCircle2 className="w-4 h-4" />
          <span>已開啟行程推播提醒</span>
        </div>
        <button
          type="button"
          onClick={handleTest}
          disabled={testing || unregistering}
          className="inline-flex min-h-11 items-center gap-2 text-xs font-medium px-4 py-2 rounded-full bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60 transition-colors dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {testing ? "測試中…" : "發送測試推播"}
        </button>
        <button
          type="button"
          onClick={handleUnregister}
          disabled={testing || unregistering}
          className="inline-flex min-h-11 items-center gap-2 text-xs font-medium px-4 py-2 rounded-full border border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-60 transition-colors dark:border-slate-600 dark:text-gray-300 dark:hover:border-red-800 dark:hover:bg-red-900/20 dark:hover:text-red-300"
        >
          {unregistering ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellOff className="w-4 h-4" />}
          {unregistering ? "關閉中…" : "關閉這台裝置推播"}
        </button>
        {hint && <span role="status" className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 text-xs font-medium px-4 py-2 rounded-full bg-primary/10 text-primary hover:ring-2 hover:ring-primary/20 disabled:opacity-60 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
        {loading ? "啟用中…" : "開啟行程推播提醒"}
      </button>
      {hint && <span role="status" className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
    </div>
  );
}

function formatPushError(error: unknown, diagnostics: string): string {
  if (!(error instanceof Error)) {
    return `無法註冊推播：未知錯誤。${formatDiagnostics(diagnostics)}`;
  }

  if (error.message.includes("subscribe-timeout")) {
    return `無法註冊推播：iPhone 訂閱逾時。請刪除主畫面上的舊捷徑，重新用 Safari 加入主畫面後再試。${formatDiagnostics(diagnostics)}`;
  }

  if (error.message.includes("Service Worker 已安裝但尚未接管頁面")) {
    return `無法註冊推播：Service Worker 已更新但還沒接管目前頁面。請完全關閉這個主畫面 App，重新打開後再按一次。${formatDiagnostics(diagnostics)}`;
  }

  if (error.message.includes("Service Worker 尚未啟用")) {
    return `無法註冊推播：Service Worker 還沒啟用完成。請完全關閉主畫面 App，重新打開後等 5 秒再按一次。${formatDiagnostics(diagnostics)}`;
  }

  return `無法註冊推播：${error.message}${formatDiagnostics(diagnostics)}`;
}

function formatDiagnostics(diagnostics: string): string {
  return `（${PUSH_UI_VERSION} · ${diagnostics}）`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("push-ui-timeout")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
