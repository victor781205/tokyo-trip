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

  if (push.current === "unsupported") {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
        <BellOff className="w-4 h-4" />
        <span>此裝置不支援推播</span>
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
          disabled={testing}
          className="inline-flex min-h-11 items-center gap-2 text-xs font-medium px-4 py-2 rounded-full bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-60 transition-colors dark:bg-green-500/10 dark:text-green-300 dark:hover:bg-green-500/20"
        >
          {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {testing ? "測試中…" : "發送測試推播"}
        </button>
        {hint && <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={handleRegister}
        disabled={loading}
        className="inline-flex min-h-11 items-center gap-2 text-xs font-medium px-4 py-2 rounded-full bg-brand/10 text-brand hover:bg-brand/20 disabled:opacity-60 transition-colors"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bell className="w-4 h-4" />}
        {loading ? "啟用中…" : "開啟行程推播提醒"}
      </button>
      {hint && <span className="text-xs text-gray-500 dark:text-gray-400">{hint}</span>}
      {push.permission === "denied" && (
        <span className="text-xs text-red-500">
          推播權限被拒絕，請到系統設定重新允許此 App 的通知。
        </span>
      )}
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
