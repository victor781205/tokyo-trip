"use client";

import { useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { Menu, X, Moon, Sun, Home, Share2, Check, Settings, Plane, CalendarDays, Wallet, UtensilsCrossed, Luggage, Languages, Map as MapIcon, RefreshCw, Copy, Eye, EyeOff, Wifi, WifiOff, Loader2, Download, History, CloudUpload } from "lucide-react";
import { useTrip } from "@/context/TripContext";
import { useDialog } from "@/context/DialogContext";
import type { LucideIcon } from "lucide-react";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";

export interface NavLink {
  id: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_LINKS: NavLink[] = [
  { id: "hero", label: "首頁", icon: Home },
  { id: "flights", label: "機票", icon: Plane },
  { id: "tripprep", label: "行前準備", icon: Luggage },
  { id: "transport", label: "交通", icon: MapIcon },
  { id: "itinerary", label: "行程", icon: CalendarDays },
  { id: "food", label: "美食", icon: UtensilsCrossed },
  { id: "assistant", label: "旅遊助手", icon: Languages },
  { id: "tools", label: "預算", icon: Wallet },
];

interface NavigationProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export function Navigation({ activeTab, setActiveTab }: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const {
    tripId,
    tripSecret,
    loginToTrip,
    getShareLink,
    rotateTripSecret,
    syncStatus,
    saveStatus,
    syncError,
    pendingSliceCount,
    lastSyncedAt,
    storageError,
    isShareReady,
    retrySync,
    flushSync,
    exportBackup,
    recentTrips,
    switchTrip,
    versionHistory,
    restoreRevision,
    hasRevisionRollback,
    applyAuthoritativeRollback,
  } = useTrip();
  const { confirm, alert } = useDialog();

  const [inputTripId, setInputTripId] = useState("");
  const [inputSecret, setInputSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const closeSyncModal = useCallback(() => setShowSyncModal(false), []);
  const menuDialogRef = useModalAccessibility(isOpen, closeMenu);
  const syncDialogRef = useModalAccessibility(showSyncModal, closeSyncModal);

  useEffect(() => {
    const mountTimer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(mountTimer);
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 1023px)");
    const previous = document.body.style.paddingBottom;
    const update = () => {
      document.body.style.paddingBottom = query.matches
        ? "calc(4.25rem + var(--sab))"
        : previous;
    };
    update();
    query.addEventListener("change", update);
    return () => {
      query.removeEventListener("change", update);
      document.body.style.paddingBottom = previous;
    };
  }, []);

  const toggleTheme = () => {
    const currentTheme = theme === 'system' ? systemTheme : theme;
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };
  const isDarkTheme = mounted && (theme === "dark" || (theme === "system" && systemTheme === "dark"));
  const themeToggleLabel = isDarkTheme ? "切換淺色模式" : "切換深色模式";



  const handleShare = async () => {
    if (pendingSliceCount > 0) {
      const flushed = await flushSync();
      if (!flushed) {
        await alert({
          title: "尚有變更未同步",
          message: "為避免同伴拿到舊版本，目前先不產生分享連結。請連線後按「立即重試」。",
          accent: "danger",
          closeText: "知道了",
        });
        return;
      }
    }
    if (!isShareReady) {
      await alert({
        title: "分享連結尚未就緒",
        message: syncStatus === "offline"
          ? "目前離線，請連線後等同步完成再分享。"
          : "正在建立雲端行程，請稍候幾秒再試。",
        closeText: "知道了",
      });
      return;
    }
    const link = getShareLink();
    let copiedOk = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
        copiedOk = true;
      }
    } catch {
      copiedOk = false;
    }
    // Fallback：較舊瀏覽器或權限不足時，用隱藏 textarea + execCommand
    if (!copiedOk) {
      try {
        const ta = document.createElement("textarea");
        ta.value = link;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        copiedOk = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        copiedOk = false;
      }
    }
    setCopied(copiedOk);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTripId || !inputSecret) return;
    setLoading(true);
    setLoginError(null);
    const success = await loginToTrip(inputTripId.trim(), inputSecret.trim());
    setLoading(false);
    if (success) {
      setShowSyncModal(false);
      setLoginError(null);
    } else {
      setLoginError(syncError || "登入失敗：請確認代號、密碼與網路連線後再試。");
    }
  };

  const handleCopySecret = async () => {
    if (!tripSecret) return;
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(tripSecret);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = tripSecret;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        ok = false;
      }
    }
    setCopiedSecret(ok);
    setTimeout(() => setCopiedSecret(false), 2000);
  };

  const handleRotateSecret = async () => {
    const ok = await confirm({
      title: "重新產生同步密碼？",
      message:
        "舊的分享連結會立刻失效，其他已登入裝置必須用新連結重新同步。\n\n建議：輪換後立刻「複製分享連結」給同伴。",
      accent: "danger",
      confirmText: "確認輪換",
      cancelText: "取消",
    });
    if (!ok) return;

    setRotating(true);
    const result = await rotateTripSecret();
    setRotating(false);

    if (result.ok) {
      setShowSecret(true);
      await alert({
        title: "密碼已更新",
        message: "同步密碼已重新產生。請重新複製分享連結給需要同步的同伴。",
        closeText: "知道了",
      });
    } else {
      await alert({
        title: "輪換失敗",
        message: result.error || "請稍後再試，或檢查網路連線。",
        accent: "danger",
        closeText: "關閉",
      });
    }
  };

  const syncBadge = (() => {
    if (syncStatus === "online") {
      if (saveStatus === "saving") {
        return { icon: Loader2, text: "正在儲存", className: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400", spin: true };
      }
      if (saveStatus === "pending") {
        return { icon: CloudUpload, text: `${pendingSliceCount} 類待同步`, className: "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400", spin: false };
      }
      if (saveStatus === "error") {
        return { icon: WifiOff, text: "儲存失敗", className: "text-red-700 bg-red-50 dark:bg-red-900/20 dark:text-red-300", spin: false };
      }
      return { icon: Wifi, text: "已同步", className: "text-green-600 bg-green-50 dark:bg-green-900/20 dark:text-green-400", spin: false };
    }
    if (syncStatus === "connecting") {
      return { icon: Loader2, text: "同步中", className: "text-blue-600 bg-blue-50 dark:bg-blue-900/20 dark:text-blue-400", spin: true };
    }
    if (syncStatus === "error") {
      return { icon: WifiOff, text: "同步失敗", className: "text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400", spin: false };
    }
    return { icon: WifiOff, text: "離線", className: "text-amber-700 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400", spin: false };
  })();
  const SyncBadgeIcon = syncBadge.icon;

  return (
    <>
      <nav
        aria-label="主要導覽"
        aria-hidden={isOpen || undefined}
        inert={isOpen || undefined}
        className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 transition-all duration-300 safe-top"
      >
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
          <button
            onClick={() => setActiveTab("hero")}
            aria-label="東京自由行主頁"
            className="min-w-11 min-h-11 text-2xl font-black text-primary hover:scale-105 transition-transform flex items-center justify-center gap-2"
          >
            🗼 <span className="hidden sm:inline">東京自由行</span>
          </button>

          {/* Desktop Nav */}
          <div className="hidden lg:flex items-center gap-2">
            {NAV_LINKS.map((link) => (
              <button
                key={link.id}
                onClick={() => setActiveTab(link.id)}
                aria-current={activeTab === link.id ? "page" : undefined}
                className={`text-sm font-black px-4 py-2 rounded-2xl transition-all duration-300 ${activeTab === link.id
                  ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                  : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                  }`}
              >
                {link.label}
              </button>
            ))}

            <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-2" />

            <button
              onClick={() => { setInputTripId(tripId); setInputSecret(tripSecret); setShowSyncModal(true); }}
              aria-label="同步設定"
              title="同步設定"
              className="relative p-2.5 bg-gray-100 dark:bg-slate-800 rounded-2xl text-gray-500 hover:text-primary transition-all active:scale-90"
            >
              <Settings className="w-5 h-5" />
              <span
                aria-hidden="true"
                className={`absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-800 ${syncStatus === "error" || saveStatus === "error" ? "bg-red-500" : syncStatus === "offline" || saveStatus === "pending" ? "bg-amber-500" : saveStatus === "saving" || syncStatus === "connecting" ? "bg-blue-500 animate-pulse" : "bg-green-500"}`}
              />
            </button>

            <button onClick={toggleTheme} aria-label={themeToggleLabel} title={themeToggleLabel} className="p-2.5 bg-gray-100 dark:bg-slate-800 rounded-2xl transition-all active:scale-90 ml-1">
              {isDarkTheme ? <Sun className="w-5 h-5 text-accent" /> : <Moon className="w-5 h-5 text-slate-700" />}
            </button>
          </div>

          {/* Mobile Nav Controls - Enhanced for Flagships */}
          <div className="flex lg:hidden items-center gap-1">
            <button
              onClick={() => { setInputTripId(tripId); setInputSecret(tripSecret); setShowSyncModal(true); }}
              className="relative p-3.5 text-gray-500 dark:text-gray-300 active:bg-gray-100 dark:active:bg-slate-800 rounded-2xl transition-colors"
              aria-label="同步設定"
            >
              <Settings className="w-6 h-6" />
              <span aria-hidden="true" className={`absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${syncStatus === "error" || saveStatus === "error" ? "bg-red-500" : syncStatus === "offline" || saveStatus === "pending" ? "bg-amber-500" : saveStatus === "saving" || syncStatus === "connecting" ? "bg-blue-500 animate-pulse" : "bg-green-500"}`} />
            </button>
            <button onClick={toggleTheme} aria-label={themeToggleLabel} title={themeToggleLabel} className="p-3.5 text-gray-400 active:bg-gray-100 dark:active:bg-slate-800 rounded-2xl transition-colors">
              {isDarkTheme ? <Sun className="w-6 h-6 text-accent" /> : <Moon className="w-6 h-6 text-slate-700" />}
            </button>
            <button
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "關閉分類選單" : "開啟分類選單"}
              aria-expanded={isOpen}
              aria-controls="mobile-nav-menu"
              className="p-3.5 text-primary bg-primary/5 rounded-2xl ml-1 active:scale-90 transition-all"
            >
              {isOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
            </button>
          </div>
        </div>
      </nav>

      {/* Flagship-Friendly Fullscreen Menu */}
      {isOpen && (
        <div
          ref={menuDialogRef}
          id="mobile-nav-menu"
          role="dialog"
          aria-modal="true"
          aria-label="分類選單"
          tabIndex={-1}
          className="fixed inset-0 z-[60] bg-white dark:bg-slate-900 lg:hidden animate-in fade-in duration-300 safe-top outline-none"
        >
          <button
            type="button"
            onClick={closeMenu}
            aria-label="關閉分類選單"
            data-autofocus
            className="absolute right-4 top-[calc(0.5rem+var(--sat))] z-10 min-h-14 min-w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center active:scale-90 transition-transform"
          >
            <X className="w-7 h-7" />
          </button>
          <div className="h-full flex flex-col pt-[calc(6rem+var(--sat))] px-6 pb-[calc(3rem+var(--sab))] overflow-y-auto">
            <div className="grid grid-cols-3 gap-3">
              {NAV_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <button
                    key={link.id}
                    onClick={() => { setActiveTab(link.id); closeMenu(); }}
                    aria-current={activeTab === link.id ? "page" : undefined}
                    className={`min-h-[6rem] rounded-[2rem] border-2 transition-all flex flex-col items-center justify-center gap-2 ${activeTab === link.id
                      ? "bg-primary border-primary text-white shadow-2xl shadow-primary/30 scale-105"
                      : "bg-gray-50 dark:bg-slate-800 border-transparent text-gray-700 dark:text-gray-300 active:scale-95"
                      }`}
                  >
                    <div className={activeTab === link.id ? "text-white" : "text-primary"}>
                      <Icon className="w-7 h-7" />
                    </div>
                    <span className="text-sm font-black">{link.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="mt-auto pt-10 space-y-3">
              <button
                onClick={() => { setIsOpen(false); setInputTripId(tripId); setInputSecret(tripSecret); setShowSyncModal(true); }}
                className="w-full py-4 rounded-[2rem] bg-gray-100 dark:bg-slate-800 text-gray-800 dark:text-gray-100 font-black flex items-center justify-center gap-3 active:scale-95 transition-all"
              >
                <Settings className="w-5 h-5 text-primary" />
                同步設定 / 登入
              </button>
              <button onClick={handleShare} className="w-full py-6 rounded-[2rem] bg-gray-900 text-white font-black flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                {copied ? <Check className="w-6 h-6 text-green-400" /> : <Share2 className="w-6 h-6" />}
                {copied ? "已成功複製連結" : "同步分享此行程"}
              </button>
            </div>
          </div>
        </div>
      )}

      {!isOpen && (
        <nav
          aria-label="手機快速導覽"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl lg:hidden pb-[var(--sab)]"
        >
          <div className="grid grid-cols-5 h-[4.25rem]">
            {NAV_LINKS.filter((link) => ["hero", "itinerary", "food", "assistant", "tools"].includes(link.id)).map((link) => {
              const Icon = link.icon;
              const active = activeTab === link.id;
              return (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => setActiveTab(link.id)}
                  aria-current={active ? "page" : undefined}
                  className={`min-h-11 flex flex-col items-center justify-center gap-1 text-[11px] font-black ${active ? "text-primary" : "text-gray-600 dark:text-gray-300"}`}
                >
                  <Icon className={`w-5 h-5 ${active ? "fill-primary/10" : ""}`} />
                  {link.label}
                </button>
              );
            })}
          </div>
        </nav>
      )}

      {/* Modern Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
          <div
            ref={syncDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-modal-title"
            tabIndex={-1}
            className="bg-white dark:bg-slate-800 w-full max-w-md max-h-[min(92dvh,40rem)] rounded-t-[2rem] sm:rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 border border-white/10 flex flex-col outline-none"
          >
            <div className="p-6 sm:p-8 bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 text-white relative shrink-0">
              <h3 id="sync-modal-title" className="text-2xl sm:text-3xl font-black mb-1">分享給同伴</h3>
              <p className="text-blue-100 text-sm opacity-90">把連結傳給對方，手機就能一起改行程</p>
              <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold bg-white/15">
                <SyncBadgeIcon className={`w-3.5 h-3.5 ${syncBadge.spin ? "animate-spin" : ""}`} />
                {syncBadge.text}
              </div>
              <button
                onClick={closeSyncModal}
                data-autofocus
                aria-label="關閉同步設定"
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6 sm:p-8 space-y-6 overflow-y-auto overscroll-contain">
              <div className="rounded-2xl bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 px-4 py-3 text-sm text-blue-900 dark:text-blue-100 leading-relaxed">
                <p className="font-black mb-1">怎麼用？（3 步）</p>
                <ol className="list-decimal list-inside space-y-0.5 text-[13px] font-medium opacity-90">
                  <li>按「複製分享連結」</li>
                  <li>用 LINE／訊息傳給同伴</li>
                  <li>對方打開連結就能一起改</li>
                </ol>
              </div>

              <section aria-labelledby="sync-health-title" className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 id="sync-health-title" className="font-black text-gray-900 dark:text-white">同步中心</h4>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">
                      {lastSyncedAt
                        ? `上次完成：${new Intl.DateTimeFormat("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(lastSyncedAt)}`
                        : "尚未完成第一次雲端同步"}
                    </p>
                  </div>
                  <span className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-black ${syncBadge.className}`}>
                    {syncBadge.text}
                  </span>
                </div>
                {pendingSliceCount > 0 && (
                  <p className="text-xs font-bold text-amber-800 dark:text-amber-300">
                    有 {pendingSliceCount} 類本機變更正在等候上傳。
                  </p>
                )}
                {(syncError || storageError) && (
                  <p role="alert" className="rounded-xl bg-red-50 dark:bg-red-950/40 px-3 py-2 text-xs font-bold text-red-800 dark:text-red-200 break-words">
                    {storageError || syncError}
                  </p>
                )}
                {hasRevisionRollback && (
                  <button
                    type="button"
                    onClick={async () => {
                      const approved = await confirm({
                        title: "改用較舊的雲端版本？",
                        message: "雲端版本號比這台裝置記錄的版本低。套用後，本機尚未同步的內容會被雲端版本取代。建議先匯出備份。",
                        accent: "danger",
                        confirmText: "確認套用雲端版本",
                        cancelText: "先不要",
                      });
                      if (approved) applyAuthoritativeRollback();
                    }}
                    className="w-full min-h-11 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200 text-sm font-black"
                  >
                    確認以雲端版本為準
                  </button>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => void retrySync()}
                    className="min-h-11 rounded-xl bg-gray-900 dark:bg-white text-white dark:text-slate-900 text-sm font-black flex items-center justify-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />立即重試
                  </button>
                  <button
                    type="button"
                    onClick={exportBackup}
                    className="min-h-11 rounded-xl bg-gray-100 dark:bg-slate-700 text-gray-800 dark:text-white text-sm font-black flex items-center justify-center gap-2"
                  >
                    <Download className="w-4 h-4" />匯出備份
                  </button>
                </div>
              </section>

              <div>
                <p className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-3 ml-1">這趟旅程的鑰匙</p>
                <div className="bg-gray-50 dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-slate-800 space-y-4">
                  <div className="flex justify-between items-center gap-2">
                    <span className="text-sm text-gray-500 font-bold shrink-0">行程代號</span>
                    <span id="trip-id-display" className="font-mono font-black text-primary bg-primary/5 px-3 py-1 rounded-lg text-xs sm:text-sm truncate max-w-[60%]">{tripId}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-500 font-bold">同步密碼</span>
                      <button
                        type="button"
                        onClick={() => setShowSecret((v) => !v)}
                        className="text-xs font-bold text-primary flex items-center gap-1"
                        aria-label={showSecret ? "隱藏密碼" : "顯示密碼"}
                      >
                        {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                        {showSecret ? "隱藏" : "顯示"}
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 min-w-0 font-mono text-xs sm:text-sm bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 rounded-xl px-3 py-2.5 truncate">
                        {showSecret ? tripSecret : "•".repeat(Math.min(24, tripSecret?.length || 12))}
                      </code>
                      <button
                        type="button"
                        onClick={handleCopySecret}
                        className="p-2.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 shrink-0 active:scale-95"
                        aria-label="複製同步密碼"
                      >
                        {copiedSecret ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed">
                      平常不用記這串字。優先複製「分享連結」即可，連結裡已含密碼。
                    </p>
                  </div>

                  <button
                    onClick={handleShare}
                    disabled={!isShareReady}
                    className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 ${copied ? "bg-green-500 text-white" : "bg-primary text-white shadow-lg shadow-primary/25 active:scale-95"
                      } disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none dark:disabled:bg-slate-700`}
                  >
                    {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                    {copied ? "已複製，去傳給同伴吧" : isShareReady ? "複製分享連結" : "等待雲端行程建立…"}
                  </button>

                  <button
                    type="button"
                    onClick={handleRotateSecret}
                    disabled={rotating}
                    className="w-full py-3.5 rounded-2xl font-bold text-sm transition-all flex items-center justify-center gap-2 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 active:scale-95 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${rotating ? "animate-spin" : ""}`} />
                    {rotating ? "正在重新產生…" : "重設密碼（舊連結會失效）"}
                  </button>
                  <p className="text-[11px] leading-relaxed text-gray-400 px-1">
                    只有在懷疑連結外洩時才按。重設後請再複製新連結給同伴。
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <label htmlFor="login-trip-id" className="text-sm font-black text-gray-400 uppercase tracking-widest block ml-1">用代號登入另一趟行程</label>
                <p className="text-xs text-gray-400 -mt-1 ml-1">有人只傳了「行程代號 + 密碼」時用這裡</p>
                <form onSubmit={handleLogin} className="space-y-3">
                  <input
                    id="login-trip-id"
                    type="text"
                    autoComplete="username"
                    placeholder="行程代號（例如 trip_xxxx）"
                    value={inputTripId}
                    onChange={e => { setInputTripId(e.target.value); setLoginError(null); }}
                    className="w-full p-4 sm:p-5 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-mono text-base"
                  />
                  <input
                    id="login-secret"
                    type="password"
                    autoComplete="current-password"
                    placeholder="同步密碼"
                    value={inputSecret}
                    onChange={e => { setInputSecret(e.target.value); setLoginError(null); }}
                    aria-label="同步密碼"
                    className="w-full p-4 sm:p-5 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-mono text-base"
                  />
                  {loginError && (
                    <p role="alert" className="text-sm font-bold text-red-500 px-1">{loginError}</p>
                  )}
                  <button
                    type="submit"
                    disabled={loading || !inputTripId || !inputSecret}
                    className="w-full py-4 sm:py-5 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black shadow-xl shadow-primary/20 transition-all active:scale-95 disabled:opacity-50"
                  >
                    {loading ? "正在載入資料..." : "登入並同步"}
                  </button>
                </form>
              </div>

              {recentTrips.some((profile) => profile.tripId !== tripId) && (
                <section aria-labelledby="recent-trips-title" className="space-y-2">
                  <h4 id="recent-trips-title" className="text-sm font-black text-gray-600 dark:text-gray-200">最近行程</h4>
                  {recentTrips.filter((profile) => profile.tripId !== tripId).slice(0, 5).map((profile) => (
                    <button
                      key={profile.tripId}
                      type="button"
                      onClick={async () => {
                        const switched = await switchTrip(profile.tripId);
                        if (!switched) {
                          await alert({
                            title: "目前無法切換",
                            message: pendingSliceCount > 0
                              ? "這趟行程仍有未同步變更。請先連線並完成同步，再切換行程。"
                              : "找不到本機憑證或雲端暫時無法驗證。",
                            accent: "danger",
                            closeText: "知道了",
                          });
                        } else {
                          setShowSyncModal(false);
                        }
                      }}
                      className="w-full min-h-12 rounded-xl border border-gray-200 dark:border-slate-700 px-3 text-left flex items-center justify-between gap-3 hover:border-primary"
                    >
                      <span className="min-w-0">
                        <span className="block text-sm font-black truncate">{profile.label}</span>
                        <span className="block text-[11px] font-mono text-gray-600 dark:text-gray-300 truncate">{profile.tripId}</span>
                      </span>
                      <span className="text-xs font-black text-primary shrink-0">切換</span>
                    </button>
                  ))}
                </section>
              )}

              {versionHistory.length > 1 && (
                <details className="rounded-2xl border border-gray-200 dark:border-slate-700 p-4">
                  <summary className="cursor-pointer list-none flex items-center gap-2 text-sm font-black">
                    <History className="w-4 h-4 text-primary" />本機版本歷史（{versionHistory.length}）
                  </summary>
                  <div className="mt-3 space-y-2">
                    {versionHistory.slice(0, 8).map((entry, index) => (
                      <div key={`${entry.revision}-${entry.savedAt}`} className="flex items-center justify-between gap-3 rounded-xl bg-gray-50 dark:bg-slate-900 px-3 py-2">
                        <span className="text-xs text-gray-700 dark:text-gray-200">
                          r{entry.revision} · {new Intl.DateTimeFormat("zh-TW", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(entry.savedAt)}
                        </span>
                        {index > 0 && (
                          <button
                            type="button"
                            onClick={async () => {
                              const approved = await confirm({
                                title: `復原到 r${entry.revision}？`,
                                message: "目前內容不會立刻刪除，會先成為待同步版本；也可先匯出備份。",
                                confirmText: "確認復原",
                                cancelText: "取消",
                              });
                              if (approved) restoreRevision(entry.revision);
                            }}
                            className="min-h-11 px-3 rounded-lg text-xs font-black text-primary"
                          >
                            復原
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
