"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { Calendar, Check, CheckCircle2, CircleSlash2, ChevronLeft, ChevronRight, Pencil, Plus, Trash2, X, Download, Loader2, CalendarPlus, AlertTriangle, MapPin, BarChart3, List, Wallet, UtensilsCrossed, MoreHorizontal, Navigation2 } from "lucide-react";
import { useTripState, type Activity } from "@/hooks/useTripState";
import { useDialog } from "@/context/DialogContext";
import { downloadICS } from "@/lib/ics-export";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import { useModalAccessibility } from "@/hooks/useModalAccessibility";
import {
  createBudgetItem,
  getBudgetDateForTripDay,
  getTokyoBudgetDate,
  MAX_YEN_AMOUNT,
  TRIP_TRAVELERS,
} from "@/lib/budget";
import { generateShortId } from "@/lib/secure-id";
import { ensureStableItineraryActivityIds } from "@/lib/trip-cache";

const BUDGET_CATEGORIES: Record<string, { icon: string; label: string }> = {
  food: { icon: "🍜", label: "餐飲" },
  transport: { icon: "🚆", label: "交通" },
  shopping: { icon: "🛍️", label: "購物" },
  ticket: { icon: "🎫", label: "門票" },
  hotel: { icon: "🏨", label: "住宿" },
  other: { icon: "💡", label: "其他" },
};

const BUDGET_SUGGESTED_AMOUNTS: Record<string, number> = {
  food: 1500,
  transport: 300,
  shopping: 3000,
  ticket: 2000,
  hotel: 10000,
  other: 1000,
};
/** 依活動名稱／標籤粗估預算類別 */
function guessBudgetCategory(act: Activity): string {
  const blob = `${act.tag || ""} ${act.name} ${act.desc || ""}`;
  if (/餐|食|lunch|dinner|breakfast|拉麵|美食|定食|燒肉|cafe|咖啡/i.test(blob)) return "food";
  if (/交通|電車|巴士|taxi|機場|移動|train|地鐵|metro|jr/i.test(blob)) return "transport";
  if (/購|shopping|店|伴手禮|藥妝|百貨/i.test(blob)) return "shopping";
  if (/門票|ticket|美術館|teamlab|展望|入場|票/i.test(blob)) return "ticket";
  if (/hotel|住宿|check-?\s?in|check-?\s?out|飯店|旅館/i.test(blob)) return "hotel";
  return "other";
}

/** 從活動名稱推測美食區（對齊 Food 的 district id） */
function guessFoodDistrict(act: Activity): string {
  const blob = `${act.name} ${act.desc || ""}`;
  const districts = [
    "錦糸町", "淺草", "上野", "秋葉原", "銀座", "新宿", "澀谷", "六本木",
    "東京車站", "押上", "豐洲", "築地", "原宿", "表參道", "中目黑", "惠比壽",
    "日比谷", "池袋", "晴空塔", "台場", "吉祥寺", "下北澤",
  ];
  for (const d of districts) {
    if (blob.includes(d)) return d === "晴空塔" ? "押上" : d === "台場" ? "豐洲" : d;
  }
  return "all";
}

/** 僅為具體地點提供導航；流程、休息與交通動作不應被當成地標搜尋。 */
function getActivityNavigationUrl(activity: Activity): string | null {
  const name = activity.name.trim();
  if (!name) return null;

  const blob = `${activity.tag || ""} ${name} ${activity.desc || ""}`;
  const isPlaceCategory = /景點|美食|餐飲|購物|住宿|神社|寺|展覽|咖啡/i.test(activity.tag || "");
  const isProcedure = /入境|領取行李|安檢|海關|登機|休息|自由活動|起床|出發|前往|移動|搭乘|轉乘|回程|班機|check-?\s?out/i.test(blob);
  if (isProcedure && !isPlaceCategory) return null;

  const query = name.replace(/^用餐[：:]\s*/, "");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${query} 東京`)}`;
}

// ── 景點座標資料（用於估算移動時間）──
const PLACE_COORDS: Record<string, { lat: number; lng: number }> = {
  "成田機場": { lat: 35.7720, lng: 140.3929 },
  "錦糸町": { lat: 35.6968, lng: 139.8144 },
  "淺草寺": { lat: 35.7148, lng: 139.7967 },
  "晴空塔": { lat: 35.7101, lng: 139.8107 },
  "明治神宮": { lat: 35.6764, lng: 139.6993 },
  "原宿": { lat: 35.6702, lng: 139.7027 },
  "澀谷": { lat: 35.6595, lng: 139.7004 },
  "新宿御苑": { lat: 35.6852, lng: 139.7100 },
  "秋葉原": { lat: 35.6984, lng: 139.7731 },
  "東京車站": { lat: 35.6812, lng: 139.7671 },
  "皇居": { lat: 35.6852, lng: 139.7527 },
  "銀座": { lat: 35.6715, lng: 139.7649 },
  "豐洲市場": { lat: 35.6462, lng: 139.7786 },
  "台場": { lat: 35.6267, lng: 139.7806 },
  "DiverCity": { lat: 35.6267, lng: 139.7806 },
  "DiverCity 台場": { lat: 35.6267, lng: 139.7806 },
  "teamLab Planets TOKYO": { lat: 35.6491, lng: 139.7897 },
  "下北澤": { lat: 35.6609, lng: 139.6684 },
  "吉祥寺": { lat: 35.7029, lng: 139.5700 },
  "吉卜力美術館": { lat: 35.6961, lng: 139.5704 },
  "上野": { lat: 35.7141, lng: 139.7774 },
};

// ── 預估活動時長（分鐘）──
const ESTIMATED_DURATIONS: Record<string, number> = {
  "早餐": 45, "午餐": 60, "晚餐": 90, "宵夜": 60,
  "Check-in": 30, "Check-out": 30,
  "逛": 120, "購物": 90, "逛街": 90,
  "神社": 60, "寺": 60, "博物館": 120, "美術館": 120,
  "展望台": 45, "夜景": 60,
  "回飯店": 0, "回 hotel": 0, "回房間": 0,
  "前往": 5, "出發": 5, "移動": 5,
  "休息": 0, "自由活動": 30,
};

// ── 計算兩點間直線距離（km）──
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── 估算交通工具時間（分鐘）──
function estimateTravelTime(distance: number): { time: number; mode: string } {
  if (distance < 1) return { time: 10, mode: "🚶 步行" };
  if (distance < 3) return { time: Math.round(distance * 12), mode: "🚶/🚇 步行+電車" };
  if (distance < 10) return { time: Math.round(distance * 3) + 10, mode: "🚇 電車" };
  return { time: Math.round(distance * 1.5) + 20, mode: "🚇+🚌 電車+巴士" };
}

// ── 檢測行程衝突 ──
function detectConflicts(activities: Activity[]): { index: number; message: string }[] {
  const conflicts: { index: number; message: string }[] = [];
  if (activities.length < 2) return conflicts;

  // 按時間排序，計算兩兩之間的間隔
  const withDuration = activities.map((act, idx) => ({
    idx,
    time: act.time,
    name: act.name,
    duration: getActivityDuration(act),
  }));

  // 依時間排序
  withDuration.sort((a, b) => a.time.localeCompare(b.time));

  for (let i = 0; i < withDuration.length - 1; i++) {
    const current = withDuration[i];
    const next = withDuration[i + 1];
    const currentEnd = addMinutes(current.time, current.duration);
    const gap = timeDifferenceMinutes(currentEnd, next.time);

    if (gap < 0) {
      conflicts.push({ index: current.idx, message: `與「${next.name}」時間重疊 ${Math.abs(gap)} 分鐘！` });
    } else if (gap > 0 && gap < 15) {
      conflicts.push({ index: current.idx, message: `與「${next.name}」只隔 ${gap} 分鐘，時間緊湊` });
    }
  }

  return conflicts;
}

function getActivityDuration(activity: Activity): number {
  for (const [keyword, duration] of Object.entries(ESTIMATED_DURATIONS)) {
    if (activity.name.includes(keyword) || activity.desc.includes(keyword)) {
      return duration;
    }
  }
  return 60; // 預設 1 小時
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number);
  const totalMins = h * 60 + m + minutes;
  return `${String(Math.floor(totalMins / 60) % 24).padStart(2, "0")}:${String(totalMins % 60).padStart(2, "0")}`;
}

function timeDifferenceMinutes(time1: string, time2: string): number {
  const [h1, m1] = time1.split(":").map(Number);
  const [h2, m2] = time2.split(":").map(Number);
  return (h2 * 60 + m2) - (h1 * 60 + m1);
}

export function Itinerary({ onNavigate }: { onNavigate?: (tab: string) => void } = {}) {
  const { isLoaded, itinerary, updateItinerary, updateBudgetItems } = useTripState();
  const { confirm, alert } = useDialog();
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [editingModal, setEditingModal] = useState<{ day: string; activitySyncId: string | null } | null>(null);
  const [formData, setFormData] = useState<Activity>({ time: "", name: "", desc: "", tag: "" });
  const [formErrors, setFormErrors] = useState<{ time?: string; name?: string; conflict?: string }>({});
  const [isExporting, setIsExporting] = useState(false);
  const [editingTitleDay, setEditingTitleDay] = useState<string | null>(null);
  const [titleInput, setTitleInput] = useState("");
  const [viewMode, setViewMode] = useState<"timeline" | "stats">("timeline");
  const [budgetModal, setBudgetModal] = useState<{
    name: string;
    amount: string;
    category: string;
    day: string;
  } | null>(null);
  const [budgetError, setBudgetError] = useState("");
  const tabScrollRef = useRef<HTMLDivElement>(null);
  const itineraryRef = useRef<HTMLDivElement>(null);
  const timeInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const budgetAmountInputRef = useRef<HTMLInputElement>(null);
  const closeEditingModal = useCallback(() => {
    setEditingModal(null);
    setFormErrors({});
  }, []);
  const closeBudgetModal = useCallback(() => {
    setBudgetModal(null);
    setBudgetError("");
  }, []);
  const editingDialogRef = useModalAccessibility(Boolean(editingModal), closeEditingModal);
  const budgetDialogRef = useModalAccessibility(Boolean(budgetModal), closeBudgetModal);

  const currentItin = useMemo(
    () => ensureStableItineraryActivityIds(Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY),
    [itinerary],
  );
  const dayKeys = Object.keys(currentItin);
  const safeActiveDayIndex = Math.min(activeDayIndex, Math.max(dayKeys.length - 1, 0));
  const activeDayKey = dayKeys[safeActiveDayIndex];
  const activeDayData = currentItin[activeDayKey];

  // ── 衝突檢測（Hooks 必須在任何 early return 之前宣告）──
  const activeConflicts = useMemo(() => detectConflicts(activeDayData.activities), [activeDayData]);

  // ── 計算移動時間（以原始 index 為 key）──
  const travelTimes = useMemo(() => {
    // Map<原始index, {from, to, duration, mode}>
    const timesMap = new Map<number, { from: string; to: string; duration: number; mode: string }>();
    const sorted = activeDayData.activities.map((act, idx) => ({ act, idx })).sort((a, b) => a.act.time.localeCompare(b.act.time));

    for (let i = 0; i < sorted.length - 1; i++) {
      const from = sorted[i].act;
      const to = sorted[i + 1].act;
      const fromCoord = PLACE_COORDS[from.name] || Object.entries(PLACE_COORDS).find(([k]) => from.desc.includes(k))?.[1];
      const toCoord = PLACE_COORDS[to.name] || Object.entries(PLACE_COORDS).find(([k]) => to.desc.includes(k))?.[1];

      if (fromCoord && toCoord) {
        const dist = haversineDistance(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng);
        const { time, mode } = estimateTravelTime(dist);
        timesMap.set(sorted[i].idx, { from: from.name, to: to.name, duration: time, mode });
      }
    }
    return timesMap;
  }, [activeDayData]);

  // ── 統計資料 ──
  const stats = useMemo(() => {
    let totalActivities = 0;
    const tagCounts: Record<string, number> = {};
    let totalTravelTime = 0;
    const itin = Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY;
    const keys = Object.keys(itin);

    Object.values(itin).forEach(day => {
      day.activities.forEach(act => {
        totalActivities++;
        if (act.tag) tagCounts[act.tag] = (tagCounts[act.tag] || 0) + 1;
      });
    });

    // 計算所有天的移動時間
    keys.forEach(key => {
      const dayActivities = itin[key].activities;
      const sorted = [...dayActivities].sort((a, b) => a.time.localeCompare(b.time));
      for (let i = 0; i < sorted.length - 1; i++) {
        const fromCoord = PLACE_COORDS[sorted[i].name] || Object.entries(PLACE_COORDS).find(([k]) => sorted[i].desc.includes(k))?.[1];
        const toCoord = PLACE_COORDS[sorted[i + 1].name] || Object.entries(PLACE_COORDS).find(([k]) => sorted[i + 1].desc.includes(k))?.[1];
        if (fromCoord && toCoord) {
          const dist = haversineDistance(fromCoord.lat, fromCoord.lng, toCoord.lat, toCoord.lng);
          const { time } = estimateTravelTime(dist);
          totalTravelTime += time;
        }
      }
    });

    return { totalActivities, tagCounts, totalTravelTime };
  }, [itinerary]);

  if (!isLoaded) {
    return (
      <div className="py-6 md:py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-primary animate-spin" />
        <span className="text-gray-400 font-bold">載入行程資料中...</span>
      </div>
    );
  }

  /** 切換天數 */
  const goToDay = (index: number) => {
    if (index >= 0 && index < dayKeys.length) {
      setActiveDayIndex(index);
      // 讓 tab 自動捲到可見範圍
      const tab = tabScrollRef.current?.children[index] as HTMLElement | undefined;
      tab?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
    }
  };

  /** 匯出為長圖 */
  const handleExport = async () => {
    if (!itineraryRef.current) return;
    setIsExporting(true);

    // 給 DOM 時間渲染全展開內容
    setTimeout(async () => {
      try {
        const { default: html2canvas } = await import("html2canvas");
        const canvas = await html2canvas(itineraryRef.current!, {
          scale: 2,
          useCORS: true,
          backgroundColor: document.documentElement.classList.contains("dark") ? "#0f172a" : "#ffffff",
          windowWidth: 1200,
        });

        const image = canvas.toDataURL("image/png", 1.0);
        const link = document.createElement("a");
        link.href = image;
        link.download = `東京自由行_行程表_${new Date().toISOString().slice(0, 10)}.png`;
        link.click();
      } catch (error) {
        console.error("Export failed:", error);
        void alert({
          title: "匯出失敗",
          message: "匯出圖片失敗，請稍後再試。",
          accent: "danger",
        });
      } finally {
        setIsExporting(false);
      }
    }, 500);
  };

  /** 編輯 / 新增 */
  const openModal = (day: string, activity?: Activity) => {
    if (activity) {
      setFormData({ ...activity });
    } else {
      setFormData({
        time: "",
        name: "",
        desc: "",
        tag: "",
        syncId: `activity:${generateShortId()}`,
      });
    }
    setFormErrors({});
    setEditingModal({ day, activitySyncId: activity?.syncId ?? null });
  };

  const handleSave = () => {
    if (!editingModal) return;

    const errors: { time?: string; name?: string; conflict?: string } = {};
    if (!formData.time) errors.time = "請選擇抵達時間";
    if (!formData.name.trim()) errors.name = "請輸入景點或店名";
    if (errors.time || errors.name) {
      setFormErrors(errors);
      if (errors.time) timeInputRef.current?.focus();
      else nameInputRef.current?.focus();
      return;
    }

    const { day, activitySyncId } = editingModal;
    const normalizedFormData = {
      ...formData,
      name: formData.name.trim(),
      syncId: formData.syncId || `activity:${generateShortId()}`,
    };
    let didSave = false;
    updateItinerary((latest) => {
      const source = ensureStableItineraryActivityIds(
        Object.keys(latest).length > 0 ? latest : DEFAULT_ITINERARY,
      );
      const latestDay = source[day];
      if (!latestDay) return latest;

      let activities: Activity[];
      if (activitySyncId) {
        const targetIndex = latestDay.activities.findIndex((activity) => activity.syncId === activitySyncId);
        if (targetIndex < 0) return latest;
        activities = latestDay.activities.map((activity, index) => index === targetIndex
          ? { ...activity, ...normalizedFormData, syncId: activitySyncId }
          : activity);
      } else {
        activities = [...latestDay.activities, normalizedFormData];
      }
      didSave = true;
      return {
        ...source,
        [day]: {
          ...latestDay,
          activities: [...activities].sort((a, b) => a.time.localeCompare(b.time)),
        },
      };
    });
    if (!didSave) {
      setFormErrors({
        conflict: activitySyncId
          ? "這項活動已在其他裝置被移除或移動。為避免覆寫最新行程，本次變更尚未儲存。"
          : "這個日期已在其他裝置被移除。為避免覆寫最新行程，本次變更尚未儲存。",
      });
      return;
    }
    setEditingModal(null);
    setFormErrors({});
  };

  const handleTitleSave = (dayKey: string) => {
    if (!titleInput.trim()) return;
    const title = titleInput.trim();
    updateItinerary((latest) => {
      const source = ensureStableItineraryActivityIds(
        Object.keys(latest).length > 0 ? latest : DEFAULT_ITINERARY,
      );
      const latestDay = source[dayKey];
      if (!latestDay) return latest;
      return {
        ...source,
        [dayKey]: { ...latestDay, title },
      };
    });
    setEditingTitleDay(null);
  };

  const deleteActivity = async (day: string, activity: Activity) => {
    const activitySyncId = activity.syncId;
    if (!activitySyncId) {
      await alert({
        title: "行程尚未同步完成",
        message: "這項活動的同步識別尚未建立，請重新整理後再試一次。",
        accent: "danger",
      });
      return;
    }
    const ok = await confirm({
      title: "刪除行程",
      message: `確定要刪除「${activity.name}」嗎？`,
      accent: "danger",
      confirmText: "刪除",
    });
    if (!ok) return;
    let didDelete = false;
    updateItinerary((latest) => {
      const source = ensureStableItineraryActivityIds(
        Object.keys(latest).length > 0 ? latest : DEFAULT_ITINERARY,
      );
      const latestDay = source[day];
      if (!latestDay || !latestDay.activities.some((item) => item.syncId === activitySyncId)) return latest;
      didDelete = true;
      return {
        ...source,
        [day]: {
          ...latestDay,
          activities: latestDay.activities.filter((item) => item.syncId !== activitySyncId),
        },
      };
    });
    if (!didDelete) {
      await alert({
        title: "行程已在其他裝置變更",
        message: "這項活動已被移除或移到其他日期，未覆寫最新行程。",
        accent: "danger",
      });
    }
  };

  /** 開啟「記錄支出」彈窗（可填金額／類別） */
  const openBudgetModal = (act: Activity) => {
    const category = guessBudgetCategory(act);
    setBudgetModal({
      name: act.name,
      amount: String(BUDGET_SUGGESTED_AMOUNTS[category] ?? BUDGET_SUGGESTED_AMOUNTS.other),
      category,
      day: activeDayKey,
    });
    setBudgetError("");
  };

  const confirmAddToBudget = async () => {
    if (!budgetModal) return;
    const amountNum = Number(budgetModal.amount);
    if (
      !budgetModal.name.trim()
      || !Number.isSafeInteger(amountNum)
      || amountNum < 1
      || amountNum > MAX_YEN_AMOUNT
    ) {
      setBudgetError(`請輸入 1～${MAX_YEN_AMOUNT.toLocaleString()} 的整數日圓金額；0 元不會列入支出。`);
      budgetAmountInputRef.current?.focus();
      return;
    }
    const dayMatch = budgetModal.day.match(/^day(\d+)$/);
    const spendDate = dayMatch
      ? getBudgetDateForTripDay(Number(dayMatch[1])) ?? getTokyoBudgetDate()
      : getTokyoBudgetDate();
    const newItem = createBudgetItem({
      id: Date.now(),
      name: budgetModal.name,
      amount: amountNum,
      category: budgetModal.category,
      date: spendDate,
    });
    if (!newItem) {
      setBudgetError("支出資料無法建立，請重新確認日期與金額。");
      budgetAmountInputRef.current?.focus();
      return;
    }
    updateBudgetItems((prev) => [newItem, ...prev]);
    setBudgetModal(null);
    setBudgetError("");
    await alert({
      title: "支出已記錄",
      message: `「${newItem.name}」¥${amountNum.toLocaleString()} 已記到 ${spendDate}。`,
      accent: "primary",
    });
  };

  /** 一鍵跳美食並帶區域篩選（sessionStorage） */
  const findNearbyFood = (act: Activity) => {
    const district = guessFoodDistrict(act);
    try {
      sessionStorage.setItem(
        "tokyo-trip-food-focus",
        JSON.stringify({ district, q: act.name, t: Date.now() }),
      );
    } catch {
      // ignore
    }
    if (onNavigate) {
      onNavigate("food");
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", "food");
      window.location.href = url.pathname + url.search + url.hash;
    }
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case "美食": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "景點": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "交通": return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
      case "購物": return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400";
      default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  /** 匯出用：渲染所有天數 */
  const renderExportView = () => (
    <div ref={itineraryRef} className="p-8 space-y-8">
      <div className="text-center mb-10 pb-10 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-4xl font-black text-primary mb-2">東京自由行</h2>
        <p className="text-xl font-bold text-gray-500">2026.09.01 - 09.06</p>
      </div>
      {dayKeys.map((dayKey) => {
        const dayData = currentItin[dayKey];
        return (
          <div key={dayKey} className="space-y-4">
            <div className="bg-gradient-to-r from-primary to-accent text-white p-4 rounded-2xl flex items-center gap-3">
              <div className="bg-white/20 p-2 rounded-xl"><Calendar className="w-5 h-5" /></div>
              <h3 className="text-lg font-black">{dayData.title}</h3>
              <span className="ml-auto text-sm font-black bg-white/20 px-3 py-1 rounded-full">{dayData.date}</span>
            </div>
            <div className="space-y-3 relative before:absolute before:left-[2.5rem] before:inset-y-0 before:w-0.5 before:bg-gray-200 dark:before:bg-slate-700">
              {dayData.activities.map((act) => (
                <div key={act.syncId} className="relative flex items-start gap-4 group">
                  <div className="w-[5rem] text-right text-primary font-black text-lg pt-0.5 shrink-0 relative z-10 bg-transparent px-1">{act.time}</div>
                  <div className="flex-1 bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border border-gray-100 dark:border-slate-800">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-black text-lg text-gray-900 dark:text-white">{act.name}</p>
                      {act.tag && <span className={`text-[10px] font-black px-2 py-0.5 rounded-lg ${getTagColor(act.tag)}`}>{act.tag}</span>}
                    </div>
                    {act.desc && <p className="text-sm text-gray-500">{act.desc}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      <div className="text-center pt-8 text-gray-400 font-bold text-sm">Made with ❤️ Tokyo Trip Planner</div>
    </div>
  );

  return (
    <section id="itinerary" className="py-4 md:py-8 max-w-7xl mx-auto transition-colors duration-300">
      {/* ── View toolbar ── */}
      <div className="text-center mb-5 md:mb-7 relative">
        {/* ── View Mode Toggle + Actions ── */}
        <div className="flex flex-wrap justify-center gap-3">
          {/* View Mode Toggle */}
          <div className="flex bg-gray-100 dark:bg-slate-800 rounded-full p-1">
            <button
              onClick={() => setViewMode("timeline")}
              className={`flex min-h-11 items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${viewMode === "timeline" ? "bg-white dark:bg-slate-700 shadow-md" : "text-gray-500 hover:text-gray-700"}`}
              aria-pressed={viewMode === "timeline"}
            >
              <List className="w-4 h-4" /> 時間線
            </button>
            <button
              onClick={() => setViewMode("stats")}
              className={`flex min-h-11 items-center gap-2 px-4 py-2 rounded-full font-bold text-sm transition-all ${viewMode === "stats" ? "bg-white dark:bg-slate-700 shadow-md" : "text-gray-500 hover:text-gray-700"}`}
              aria-pressed={viewMode === "stats"}
            >
              <BarChart3 className="w-4 h-4" /> 統計
            </button>
          </div>

          <details className="relative group text-left">
            <summary className="min-h-11 cursor-pointer list-none [&::-webkit-details-marker]:hidden inline-flex items-center justify-center gap-2 bg-white dark:bg-slate-800 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-slate-700 px-4 py-2 rounded-full font-black text-sm shadow-sm hover:border-primary/40 transition-colors">
              <MoreHorizontal aria-hidden="true" className="w-4 h-4" />
              更多
            </summary>
            <div role="group" aria-label="匯出行程" className="absolute right-0 z-30 mt-2 w-52 space-y-2 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2 shadow-2xl">
              <button
                type="button"
                onClick={handleExport}
                disabled={isExporting}
                className="min-h-11 w-full flex items-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-4 py-2 rounded-xl font-black text-sm transition-colors disabled:opacity-50"
              >
                {isExporting ? <Loader2 aria-hidden="true" className="w-4 h-4 animate-spin" /> : <Download aria-hidden="true" className="w-4 h-4" />}
                {isExporting ? "正在產生圖片..." : "匯出圖片"}
              </button>
              <button
                type="button"
                onClick={() => downloadICS(currentItin)}
                className="min-h-11 w-full flex items-center gap-2 bg-primary text-white px-4 py-2 rounded-xl font-black text-sm transition-colors"
              >
                <CalendarPlus aria-hidden="true" className="w-4 h-4" />
                匯出 ICS
              </button>
            </div>
          </details>
        </div>
      </div>

      {/* ── 統計視圖 ── */}
      {viewMode === "stats" && !isExporting && (
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 md:p-12 shadow-2xl border border-gray-100 dark:border-slate-700 mb-8">
          <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
            <BarChart3 className="w-6 h-6 text-primary" /> 行程統計
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-2xl text-center">
              <div className="text-4xl font-black text-primary mb-2">{stats.totalActivities}</div>
              <div className="text-sm text-gray-500 font-bold">總活動數</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-2xl text-center">
              <div className="text-4xl font-black text-accent mb-2">{Math.round(stats.totalTravelTime / 60)}h</div>
              <div className="text-sm text-gray-500 font-bold">移動時間</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-2xl text-center">
              <div className="text-4xl font-black text-green-700 dark:text-green-300 mb-2">{dayKeys.length}</div>
              <div className="text-sm text-gray-500 font-bold">天數</div>
            </div>
            <div className="bg-gray-50 dark:bg-slate-900 p-6 rounded-2xl text-center">
              <div className="text-4xl font-black text-blue-500 mb-2">{Object.keys(stats.tagCounts).length}</div>
              <div className="text-sm text-gray-500 font-bold">活動類別</div>
            </div>
          </div>

          {/* Activity Type Distribution */}
          <div className="mb-6">
            <h4 className="text-lg font-black mb-4">活動類型分佈</h4>
            <div className="flex flex-wrap gap-3">
              {Object.entries(stats.tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => (
                <div key={tag} className={`px-4 py-2 rounded-full font-bold text-sm ${getTagColor(tag)}`}>
                  {tag}: {count}
                </div>
              ))}
            </div>
          </div>

          {/* Tag Distribution Bar */}
          <div className="space-y-3">
            {Object.entries(stats.tagCounts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => {
              const percent = (count / stats.totalActivities) * 100;
              const colors: Record<string, string> = { "美食": "bg-orange-500", "景點": "bg-blue-500", "交通": "bg-gray-500", "購物": "bg-pink-500" };
              return (
                <div key={tag}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-bold">{tag}</span>
                    <span className="text-gray-500">{count} 項 ({percent.toFixed(0)}%)</span>
                  </div>
                  <div className="w-full h-3 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colors[tag] || "bg-gray-500"} transition-all duration-700`} style={{ width: `${percent}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── 匯出模式：顯示全展開 ── */}
      {isExporting ? renderExportView() : (
        <>
          {/* ══════ Mobile：水平滑動切換天數 ══════ */}
          <div className="md:hidden">
            {/* ── Day Tabs ── */}
            <div className="flex items-center gap-2 mb-6">
              <div ref={tabScrollRef} className="flex-1 flex gap-2 overflow-x-auto scrollbar-hide pb-1 snap-x snap-mandatory scroll-smooth">
                {dayKeys.map((dayKey, i) => {
                  const dayData = currentItin[dayKey];
                  const isActive = i === safeActiveDayIndex;
                  const emoji = dayData.title.split(" ")[0];
                  const label = dayData.title.replace(/^[^\s]+\s+Day\s+\d+\s*[-–—:：]?\s*/, "");
                  return (
                    <button
                      key={dayKey}
                      onClick={() => goToDay(i)}
                      aria-current={isActive ? "true" : undefined}
                      className={`snap-center shrink-0 px-4 py-3 rounded-2xl font-black text-sm transition-all duration-300 flex items-center gap-2 min-w-[7rem] whitespace-nowrap ${isActive
                        ? "bg-gradient-to-r from-primary to-accent text-white shadow-lg shadow-primary/30 scale-105"
                        : "bg-white dark:bg-slate-800 text-gray-500 dark:text-gray-400 border border-gray-200 dark:border-slate-700 hover:border-primary/30 hover:text-primary"
                        }`}
                    >
                      <span className="text-lg">{emoji}</span>
                      <div className="text-left leading-tight">
                        <div className={`text-[10px] uppercase tracking-widest ${isActive ? "text-white" : "text-gray-600 dark:text-gray-300"}`}>Day {i + 1}</div>
                        <div className="text-xs font-black truncate max-w-[6rem]">{label}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ── Active Day Header ── */}
            <div className="bg-gradient-to-r from-primary to-accent text-white p-4 sm:p-5 rounded-[2rem] shadow-xl mb-6 flex items-center gap-3 sm:gap-4">
              <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-sm">
                <Calendar className="w-6 h-6" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg sm:text-xl font-black leading-tight text-balance">{activeDayData.title}</h3>
                <p className="text-xs sm:text-sm font-bold text-white mt-0.5 leading-snug">{activeDayData.date}・{activeDayData.activities.length} 項行程</p>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => goToDay(safeActiveDayIndex - 1)} aria-label="前一天" disabled={safeActiveDayIndex === 0} className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/20 disabled:opacity-30 transition-all">
                  <ChevronLeft className="w-5 h-5" />
                </button>
                <button onClick={() => goToDay(safeActiveDayIndex + 1)} aria-label="後一天" disabled={safeActiveDayIndex === dayKeys.length - 1} className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl bg-white/20 disabled:opacity-30 transition-all">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* ── Activities Timeline (mobile) ── */}
            <div className="relative space-y-6 before:absolute before:inset-0 before:left-[2.25rem] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-slate-700 before:to-transparent animate-in fade-in slide-in-from-right-4 duration-400" key={activeDayKey}>
              {activeDayData.activities.map((act, idx) => (
                <div key={act.syncId} className="relative flex items-start gap-6 group">
                  <div className="w-[4.5rem] pr-2 text-right text-primary font-black text-xl pt-0.5 shrink-0 tabular-nums relative z-10 px-1">{act.time}</div>
                  <div className="flex-1 pb-2">
                    {activeConflicts.find((conflict) => conflict.index === idx) && (
                      <div className="mb-2 flex items-start gap-1.5 rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-800 dark:bg-orange-900/20 dark:text-orange-200">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                        {activeConflicts.find((conflict) => conflict.index === idx)?.message}
                      </div>
                    )}
                    <div className={`trip-card bg-white dark:bg-slate-800 p-5 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-slate-700 hover:shadow-xl transition-shadow relative group/card overflow-hidden ${act.status === "done" ? "opacity-75" : act.status === "skipped" ? "opacity-60" : ""}`}>
                      <div className="absolute top-0 right-0 w-2 h-full bg-primary opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                      <div className="flex flex-col justify-between gap-3 mb-3">
                        <p className="font-black text-xl text-gray-900 dark:text-white leading-tight">{act.name}</p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {act.status === "done" && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"><CheckCircle2 className="h-3 w-3" /> 已完成</span>}
                          {act.status === "skipped" && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200"><CircleSlash2 className="h-3 w-3" /> 已略過</span>}
                          {act.tag && <span className={`self-start text-[10px] font-black px-3 py-1 rounded-lg uppercase tracking-widest ${getTagColor(act.tag)}`}>{act.tag}</span>}
                        </div>
                      </div>
                      {act.desc && <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{act.desc}</p>}
                      <div className="grid grid-cols-3 gap-2 transition-colors duration-300">
                        <button onClick={() => openModal(activeDayKey, act)} aria-label={`編輯「${act.name}」`} className="w-full min-w-11 h-11 flex items-center justify-center text-primary hover:bg-primary/10 rounded-xl transition-colors active:scale-90"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => openBudgetModal(act)} aria-label={`記錄「${act.name}」支出`} className="w-full min-w-11 h-11 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-xl transition-colors active:scale-90"><Wallet className="w-4 h-4" /></button>
                        <button onClick={() => findNearbyFood(act)} aria-label={`找「${act.name}」附近美食`} className="w-full min-w-11 h-11 flex items-center justify-center text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-xl transition-colors active:scale-90"><UtensilsCrossed className="w-4 h-4" /></button>
                        {getActivityNavigationUrl(act) && <a href={getActivityNavigationUrl(act)!} target="_blank" rel="noopener noreferrer" aria-label={`導航至「${act.name}」`} className="w-full min-w-11 h-11 flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-xl transition-colors active:scale-90"><Navigation2 className="w-4 h-4" /></a>}
                        <button onClick={() => deleteActivity(activeDayKey, act)} aria-label={`刪除「${act.name}」`} className="w-full min-w-11 h-11 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-xl transition-colors active:scale-90"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </div>
                    {travelTimes.get(idx) && (
                      <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-300">
                        <MapPin className="h-4 w-4 shrink-0 text-primary" />
                        <span className="font-bold">下一站約 {travelTimes.get(idx)!.duration} 分鐘</span>
                        <span>· {travelTimes.get(idx)!.mode}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              <button onClick={() => openModal(activeDayKey)} className="w-full mt-6 p-5 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl text-gray-400 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 font-black uppercase tracking-widest">
                <Plus className="w-6 h-6" /> 新增行程活動
              </button>
            </div>

            {/* ── Progress Dots ── */}
            <div className="flex justify-center gap-2 mt-8">
              {dayKeys.map((_, i) => (
                <button
                  key={i}
                  onClick={() => goToDay(i)}
                  aria-label={`前往第 ${i + 1} 天`}
                  aria-current={i === safeActiveDayIndex ? "step" : undefined}
                  className="w-11 h-11 inline-flex items-center justify-center rounded-full transition-transform active:scale-90"
                >
                  <span aria-hidden className={`rounded-full transition-all duration-300 ${i === safeActiveDayIndex ? "w-8 h-2.5 bg-primary" : "w-2.5 h-2.5 bg-gray-300 dark:bg-slate-600"}`} />
                </button>
              ))}
            </div>
          </div>

          {/* ══════ Desktop：6 天水平收折展開 ══════ */}
          <div className="hidden md:block">
            {/* ── Day Headers Row ── */}
            <div className="grid grid-cols-6 gap-3 mb-6">
              {dayKeys.map((dayKey, i) => {
                const dayData = currentItin[dayKey];
                const isActive = i === safeActiveDayIndex;
                return (
                  <button
                    key={dayKey}
                    onClick={() => goToDay(i)}
                    aria-current={isActive ? "true" : undefined}
                    className={`relative px-4 py-4 rounded-2xl transition-all duration-300 text-center group overflow-hidden ${isActive
                      ? "bg-gradient-to-r from-primary to-accent text-white shadow-xl shadow-primary/30 scale-[1.03]"
                      : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:border-primary/40 hover:shadow-lg"
                      }`}
                  >
                    <div className={`text-xs font-black uppercase tracking-widest ${isActive ? "text-white" : "text-gray-400"}`}>Day {i + 1}</div>
                    <div className="font-black text-sm leading-tight line-clamp-1 mt-1" title={dayData.title}>{dayData.title.replace(/^[^\s]+\s+Day\s+\d+\s*[-–—:：]?\s*/, "")}</div>
                    <div className={`text-xs font-extrabold mt-1 ${isActive ? "text-white" : "text-gray-500"}`}>{dayData.date}・{dayData.activities.length} 項</div>
                    {isActive && (
                      <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-6 h-6 bg-gradient-to-r from-primary to-accent rotate-45 rounded-sm shadow-lg"></div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ── Expanded Activities ── */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700 animate-in fade-in slide-in-from-bottom-4 duration-400" key={activeDayKey}>
              <div className="flex items-center justify-between mb-6">
                {editingTitleDay === activeDayKey ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      aria-label="行程標題"
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") handleTitleSave(activeDayKey); if (e.key === "Escape") setEditingTitleDay(null); }}
                      className="flex-1 text-2xl font-black bg-transparent border-b-2 border-primary outline-none py-1 text-gray-900 dark:text-white"
                    />
                    <button onClick={() => handleTitleSave(activeDayKey)} aria-label="儲存行程標題" className="w-11 h-11 inline-flex items-center justify-center bg-primary text-white rounded-xl hover:bg-primary-dark transition-colors"><Check className="w-4 h-4" /></button>
                    <button onClick={() => setEditingTitleDay(null)} aria-label="取消編輯行程標題" className="w-11 h-11 inline-flex items-center justify-center bg-gray-200 dark:bg-slate-700 rounded-xl hover:bg-gray-300 dark:hover:bg-slate-600 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button
                    aria-label="點擊編輯標題"
                    className="min-h-11 text-2xl font-black text-gray-900 dark:text-white flex items-center gap-3 cursor-pointer hover:text-primary transition-colors group/title text-left"
                    onClick={() => { setEditingTitleDay(activeDayKey); setTitleInput(activeDayData.title); }}
                  >
                    <Calendar className="w-6 h-6 text-primary" />
                    <h3>{activeDayData.title}</h3>
                    <Pencil className="w-4 h-4 opacity-0 group-hover/title:opacity-100 group-focus-visible/title:opacity-100 transition-opacity hidden md:inline" />
                  </button>
                )}
                <span className="text-sm font-bold text-gray-400">{activeDayData.date}・{activeDayData.activities.length} 項行程</span>
              </div>

              <div className="relative space-y-4 before:absolute before:inset-0 before:left-[2.5rem] before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-slate-700 before:to-transparent">
                {activeDayData.activities.map((act, idx) => (
                  <div key={act.syncId} className="relative flex items-start gap-8 group">
                    <div className="w-[5rem] pr-3 text-right text-primary font-black text-xl pt-0.5 shrink-0 tabular-nums relative z-10 px-1">{act.time}</div>
                    <div className="flex-1 pb-1">
                      {/* Conflict Warning */}
                      {activeConflicts.find(c => c.index === idx) && (
                        <div className="flex items-center gap-1.5 text-xs text-orange-800 dark:text-orange-200 font-bold mb-2 px-3 py-1.5 bg-orange-50 dark:bg-orange-900/20 rounded-lg w-fit">
                          <AlertTriangle className="w-3.5 h-3.5" /> {activeConflicts.find(c => c.index === idx)?.message}
                        </div>
                      )}
                      <div className={`bg-gray-50 dark:bg-slate-900/50 p-4 rounded-2xl hover:shadow-md transition-shadow relative group/card overflow-hidden ${act.status === "done" ? "opacity-75" : act.status === "skipped" ? "opacity-60" : ""}`}>
                        <div className="absolute top-0 right-0 w-1.5 h-full bg-primary opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                        <div className="flex items-center justify-between gap-3 mb-1">
                          <p className="font-black text-lg text-gray-900 dark:text-white leading-tight">{act.name}</p>
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {act.status === "done" && <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200"><CheckCircle2 className="h-3 w-3" /> 已完成</span>}
                            {act.status === "skipped" && <span className="inline-flex items-center gap-1 rounded-lg bg-slate-200 px-2 py-1 text-[10px] font-black text-slate-700 dark:bg-slate-700 dark:text-slate-200"><CircleSlash2 className="h-3 w-3" /> 已略過</span>}
                            {act.tag && <span className={`text-xs font-black px-2.5 py-0.5 rounded-lg uppercase tracking-widest ${getTagColor(act.tag)}`}>{act.tag}</span>}
                          </div>
                        </div>
                        {act.desc && <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{act.desc}</p>}
                        <div className="flex flex-wrap gap-1 transition-opacity duration-300 mt-2">
                          <button onClick={() => openModal(activeDayKey, act)} aria-label={`編輯「${act.name}」`} className="w-11 h-11 shrink-0 flex items-center justify-center text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-xl transition-colors active:scale-90"><Pencil className="w-3.5 h-3.5" /></button>
                          <button onClick={() => openBudgetModal(act)} aria-label={`記錄「${act.name}」支出`} className="w-11 h-11 shrink-0 flex items-center justify-center text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 rounded-xl transition-colors active:scale-90"><Wallet className="w-3.5 h-3.5" /></button>
                          <button onClick={() => findNearbyFood(act)} aria-label={`找「${act.name}」附近美食`} className="w-11 h-11 shrink-0 flex items-center justify-center text-orange-500 hover:bg-orange-50 dark:hover:bg-orange-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-xl transition-colors active:scale-90"><UtensilsCrossed className="w-3.5 h-3.5" /></button>
                          {getActivityNavigationUrl(act) && <a href={getActivityNavigationUrl(act)!} target="_blank" rel="noopener noreferrer" aria-label={`導航至「${act.name}」`} className="w-11 h-11 shrink-0 flex items-center justify-center text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl transition-colors active:scale-90"><Navigation2 className="w-3.5 h-3.5" /></a>}
                          <button onClick={() => deleteActivity(activeDayKey, act)} aria-label={`刪除「${act.name}」`} className="w-11 h-11 shrink-0 flex items-center justify-center text-red-500 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 rounded-xl transition-colors active:scale-90"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </div>
                      {travelTimes.get(idx) && (
                        <div className="mt-2 flex items-center gap-2 rounded-xl border border-dashed border-gray-200 px-3 py-2 text-xs text-gray-500 dark:border-slate-700 dark:text-gray-300">
                          <MapPin className="h-4 w-4 shrink-0 text-primary" />
                          <span className="font-bold">下一站約 {travelTimes.get(idx)!.duration} 分鐘</span>
                          <span>· {travelTimes.get(idx)!.mode}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <button onClick={() => openModal(activeDayKey)} className="w-full p-4 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-2xl text-gray-400 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-2 font-black text-sm uppercase tracking-widest">
                  <Plus className="w-5 h-5" /> 新增行程活動
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Edit/Add Modal ── */}
      {editingModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            ref={editingDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="itinerary-edit-title"
            aria-describedby={formErrors.conflict ? "itinerary-edit-conflict" : undefined}
            tabIndex={-1}
            className="bg-white dark:bg-slate-800 w-full max-w-lg max-h-[calc(100dvh-1.5rem-var(--sat)-var(--sab))] sm:max-h-[calc(100dvh-2rem-var(--sat)-var(--sab))] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 outline-none"
          >
            <div className="p-6 md:p-8 bg-gradient-to-r from-primary to-accent text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl"><Calendar className="w-5 h-5" /></div>
                <h3 id="itinerary-edit-title" className="text-2xl font-black">{editingModal.activitySyncId ? "編輯計畫" : "新增計畫"}</h3>
              </div>
              <button onClick={closeEditingModal} data-autofocus aria-label="關閉行程編輯" className="w-11 h-11 inline-flex items-center justify-center hover:bg-white/20 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                handleSave();
              }}
              className="p-6 md:p-10 space-y-6 overflow-y-auto overscroll-contain"
            >
              {formErrors.conflict && (
                <div id="itinerary-edit-conflict" role="alert" className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-black leading-relaxed text-amber-950 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100">
                  {formErrors.conflict}
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label htmlFor="itinerary-time" className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">抵達時間 <span aria-hidden="true">*</span></label>
                  <input
                    ref={timeInputRef}
                    id="itinerary-time"
                    type="time"
                    value={formData.time}
                    onChange={e => {
                      setFormData({ ...formData, time: e.target.value });
                      if (formErrors.time) setFormErrors(previous => ({ ...previous, time: undefined }));
                    }}
                    required
                    aria-invalid={Boolean(formErrors.time)}
                    aria-describedby={formErrors.time ? "itinerary-time-error" : undefined}
                    className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-black text-lg"
                  />
                  {formErrors.time && <p id="itinerary-time-error" role="alert" className="text-sm font-bold text-red-600 dark:text-red-400">{formErrors.time}</p>}
                </div>
                <div className="space-y-2">
                  <label htmlFor="itinerary-tag" className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">活動類型</label>
                  <select
                    id="itinerary-tag"
                    value={formData.tag}
                    onChange={e => setFormData({ ...formData, tag: e.target.value })}
                    className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold"
                  >
                    <option value="">無標籤</option>
                    <option value="美食">🍜 美食</option>
                    <option value="景點">📍 景點</option>
                    <option value="交通">🚆 交通</option>
                    <option value="購物">🛍️ 購物</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="itinerary-name" className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">景點或店名 <span aria-hidden="true">*</span></label>
                <input
                  ref={nameInputRef}
                  id="itinerary-name"
                  type="text"
                  placeholder="例如：東京鐵塔、築地市場..."
                  value={formData.name}
                  onChange={e => {
                    setFormData({ ...formData, name: e.target.value });
                    if (formErrors.name) setFormErrors(previous => ({ ...previous, name: undefined }));
                  }}
                  required
                  aria-invalid={Boolean(formErrors.name)}
                  aria-describedby={formErrors.name ? "itinerary-name-error" : undefined}
                  className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-black text-xl"
                />
                {formErrors.name && <p id="itinerary-name-error" role="alert" className="text-sm font-bold text-red-600 dark:text-red-400">{formErrors.name}</p>}
              </div>

              <div className="space-y-2">
                <label htmlFor="itinerary-description" className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">詳細說明</label>
                <textarea
                  id="itinerary-description"
                  placeholder="補充交通資訊、門票價格、想吃的料理..."
                  value={formData.desc}
                  onChange={e => setFormData({ ...formData, desc: e.target.value })}
                  className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all h-32 leading-relaxed text-sm font-medium"
                />
              </div>

              <div className="pt-4 flex gap-4">
                <button
                  type="submit"
                  className="flex-1 py-5 rounded-[1.5rem] font-black bg-primary text-white hover:bg-primary-dark shadow-xl shadow-primary/30 transition-all flex items-center justify-center gap-3 uppercase tracking-widest"
                >
                  <Check className="w-6 h-6" /> 儲存變更
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── 記錄支出 Modal ── */}
      {budgetModal && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div
            ref={budgetDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="itinerary-budget-title"
            tabIndex={-1}
            className="bg-white dark:bg-slate-800 w-full max-w-md max-h-[calc(100dvh-1.5rem-var(--sat)-var(--sab))] sm:max-h-[calc(100dvh-2rem-var(--sat)-var(--sab))] rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 outline-none"
          >
            <div className="p-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white flex justify-between items-center shrink-0">
              <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-xl"><Wallet className="w-5 h-5" /></div>
                <h3 id="itinerary-budget-title" className="text-xl font-black">記錄實際支出</h3>
              </div>
              <button onClick={closeBudgetModal} data-autofocus className="w-11 h-11 inline-flex items-center justify-center hover:bg-white/20 rounded-full transition-colors" aria-label="關閉記錄支出">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="p-6 space-y-5 overflow-y-auto overscroll-contain">
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-900 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-100">
                <p>將記錄在 {DEFAULT_ITINERARY[budgetModal.day]?.date ?? "目前行程日"}。請在實際支付後使用，避免尚未消費的計畫提前扣除預算。</p>
                <p className="mt-1 text-emerald-800 dark:text-emerald-200">
                  預設由 {TRIP_TRAVELERS[0]} 付款、{TRIP_TRAVELERS.join(" 與 ")}共同分攤；可在旅費工具內修改。
                </p>
              </div>
              <div className="space-y-2">
                <label htmlFor="itinerary-budget-name" className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">項目名稱</label>
                <input
                  id="itinerary-budget-name"
                  type="text"
                  value={budgetModal.name}
                  onChange={(e) => setBudgetModal({ ...budgetModal, name: e.target.value })}
                  className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-emerald-500 focus:outline-none transition-all font-bold text-lg"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="itinerary-budget-amount" className="text-[10px] font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest ml-1">金額（日圓 ¥，最低 ¥1）</label>
                <input
                  ref={budgetAmountInputRef}
                  id="itinerary-budget-amount"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MAX_YEN_AMOUNT}
                  step={1}
                  placeholder="例如 1200"
                  value={budgetModal.amount}
                  onChange={(e) => {
                    setBudgetModal({ ...budgetModal, amount: e.target.value });
                    setBudgetError("");
                  }}
                  aria-invalid={Boolean(budgetError)}
                  aria-describedby={budgetError ? "itinerary-budget-error" : "itinerary-budget-hint"}
                  className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-emerald-500 focus:outline-none transition-all font-black text-xl tabular-nums"
                  autoFocus
                />
                <p id="itinerary-budget-hint" className="text-xs font-bold text-gray-600 dark:text-gray-300">已依活動類別帶入建議金額，可按實際費用修改。</p>
                {budgetError && <p id="itinerary-budget-error" role="alert" className="text-sm font-black text-red-700 dark:text-red-300">{budgetError}</p>}
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">類別</label>
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(BUDGET_CATEGORIES).map(([key, cat]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        const oldSuggestion = BUDGET_SUGGESTED_AMOUNTS[budgetModal.category];
                        setBudgetModal({
                          ...budgetModal,
                          category: key,
                          amount: Number(budgetModal.amount) === oldSuggestion
                            ? String(BUDGET_SUGGESTED_AMOUNTS[key] ?? BUDGET_SUGGESTED_AMOUNTS.other)
                            : budgetModal.amount,
                        });
                        setBudgetError("");
                      }}
                      className={`p-3 rounded-2xl border-2 text-sm font-bold transition-all ${budgetModal.category === key
                        ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                        : "border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 text-gray-500"
                        }`}
                    >
                      <span className="block text-xl mb-0.5">{cat.icon}</span>
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void confirmAddToBudget()}
                className="w-full py-4 rounded-2xl font-black bg-emerald-500 hover:bg-emerald-600 text-white shadow-xl shadow-emerald-500/30 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                <Check className="w-5 h-5" /> 確認記錄
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
