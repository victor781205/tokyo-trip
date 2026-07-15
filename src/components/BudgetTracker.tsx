"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import dynamic from "next/dynamic";
import { Trash2, Pencil, Check, Plus, PieChart, CreditCard, Wallet, ScanLine, Loader2, RotateCcw, X } from "lucide-react";
import { useTripState, type BudgetItem } from "@/hooks/useTripState";
import { useDialog } from "@/context/DialogContext";
import {
  getDateInTimeZone,
  getTripTimelineState,
  TRIP_OUTBOUND_DATE,
  TRIP_TOTAL_DAYS,
} from "@/lib/trip-dates";
import {
  createBudgetItem,
  getBudgetDateForTripDay,
  getBudgetTripDayLabel,
  getTokyoBudgetDate,
  MAX_YEN_AMOUNT,
  normalizeBudgetCategory,
  normalizeBudgetDate,
  normalizeYenAmount,
  TRIP_TRAVELERS,
  type BudgetCategoryKey,
} from "@/lib/budget";

/** 依「現在」計算行程進度相關數值 */
function getTripProgress(now = Date.now()) {
  const state = getTripTimelineState(new Date(now));
  return {
    phase: state.phase,
    elapsedDays: state.elapsedDays,
    remainingDays: state.remainingDays,
  };
}

// 動態載入 ReceiptScanner（Tesseract.js OCR ~5MB，按需載入）
const ReceiptScanner = dynamic(
  () => import("@/components/ReceiptScanner").then(mod => ({ default: mod.ReceiptScanner })),
  {
    loading: () => (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md">
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-2xl flex flex-col items-center gap-4">
          <Loader2 className="w-10 h-10 animate-spin text-primary" />
          <p className="text-lg font-bold text-gray-600 dark:text-gray-300">載入發票掃描器...</p>
        </div>
      </div>
    ),
    ssr: false,
  }
);

type ReceiptItem = { name: string; amount: number; category: string; };

const CATEGORIES = {
  food: { icon: "🍜", label: "餐飲", color: "#ef4444" },
  transport: { icon: "🚆", label: "交通", color: "#3b82f6" },
  shopping: { icon: "🛍️", label: "購物", color: "#a855f7" },
  ticket: { icon: "🎫", label: "門票", color: "#f59e0b" },
  hotel: { icon: "🏨", label: "住宿", color: "#10b981" },
  other: { icon: "💡", label: "其他", color: "#6b7280" },
} as const;

const FALLBACK_JPY_PER_TWD = 4.65;
type CategoryKey = BudgetCategoryKey;
const DAILY_PACE_CATEGORIES = new Set<CategoryKey>(["food", "transport", "shopping", "other"]);

function addYenSafely(total: number, amount: number): number {
  return Math.min(Number.MAX_SAFE_INTEGER, total + amount);
}

export function BudgetTracker() {
  const { isLoaded, budgetItems, updateBudgetItems, budgetLimit, setBudgetLimit } = useTripState();
  const { confirm } = useDialog();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [expenseDate, setExpenseDate] = useState(() => getTokyoBudgetDate());
  const [payer, setPayer] = useState<string>(TRIP_TRAVELERS[0]);
  const [participants, setParticipants] = useState<string[]>([...TRIP_TRAVELERS]);
  const [editingId, setEditingId] = useState<BudgetItem["id"] | null>(null);
  const [deletedItem, setDeletedItem] = useState<{ item: BudgetItem; index: number } | null>(null);
  const [jpyPerTwd, setJpyPerTwd] = useState(FALLBACK_JPY_PER_TWD);
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState("");
  const [limitError, setLimitError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/currency")
      .then(async (response) => {
        if (!response.ok) throw new Error("rate unavailable");
        return response.json() as Promise<{ rate?: number }>;
      })
      .then((data) => {
        if (!cancelled && Number.isFinite(data.rate) && Number(data.rate) > 0) {
          setJpyPerTwd(Number(data.rate));
        }
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearInterval(timer);
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const handleScanComplete = useCallback((scannedItems: ReceiptItem[]) => {
    const scannedAt = new Date();
    const expenseDate = getTokyoBudgetDate(scannedAt);
    const newItems = scannedItems
      .map((item, index) => createBudgetItem({
        id: scannedAt.getTime() + index,
        name: item.name,
        amount: item.amount,
        category: item.category,
        date: expenseDate,
      }))
      .filter((item): item is BudgetItem => item !== null);
    if (newItems.length > 0) updateBudgetItems((prev) => [...newItems, ...prev]);
  }, [updateBudgetItems]);

  // ── 衍生數值（useMemo，避免每次 render 重算）──
  // 注意：hooks 必須在條件 return 之前，故 isLoaded 檢查移到 useMemo 之後
  const safeBudgetLimit = normalizeYenAmount(budgetLimit) ?? 0;
  const spent = useMemo(
    () => budgetItems.reduce(
      (sum, item) => {
        const validAmount = normalizeYenAmount(item.amount);
        return validAmount === null ? sum : addYenSafely(sum, validAmount);
      },
      0,
    ),
    [budgetItems],
  );
  const remaining = useMemo(() => Math.max(safeBudgetLimit - spent, 0), [safeBudgetLimit, spent]);
  const overBudget = useMemo(() => Math.max(spent - safeBudgetLimit, 0), [safeBudgetLimit, spent]);
  const percentage = useMemo(
    () => safeBudgetLimit > 0 ? Math.min((spent / safeBudgetLimit) * 100, 100) : (spent > 0 ? 100 : 0),
    [spent, safeBudgetLimit]
  );
  const tripProgress = useMemo(() => getTripProgress(now), [now]);

  const budgetAnalysis = useMemo(() => {
    const { phase, elapsedDays, remainingDays } = tripProgress;
    const elapsed = Math.max(1, elapsedDays);
    const todayInTokyo = getDateInTimeZone(new Date(now), "Asia/Tokyo");
    // 只用旅途中、截至今天的日常支出推算後續花費。住宿、門票等固定成本
    // 已包含在 spent，但不可再乘上六天，否則會嚴重高估。
    const tripSpendToDate = budgetItems.reduce((sum, item) => {
      const amount = normalizeYenAmount(item.amount);
      const date = normalizeBudgetDate(item.date);
      const itemCategory = normalizeBudgetCategory(item.category);
      if (
        amount === null ||
        date === null ||
        date < TRIP_OUTBOUND_DATE ||
        date > todayInTokyo ||
        !DAILY_PACE_CATEGORIES.has(itemCategory)
      ) return sum;
      return addYenSafely(sum, amount);
    }, 0);
    const avgDailyTripSpend = tripSpendToDate / elapsed;
    const futureDays = Math.max(0, TRIP_TOTAL_DAYS - elapsedDays);
    const projectedTotal = phase === "pre"
      ? null
      : phase === "done"
        ? spent
        : Math.min(
            Number.MAX_SAFE_INTEGER,
            Math.round(spent + avgDailyTripSpend * futureDays),
          );
    // 建議每日預算：剩餘金額 / 剩餘天數
    const suggestedDaily = phase === "done"
      ? 0
      : Math.round(remaining / Math.max(1, remainingDays));
    const overage = projectedTotal === null ? 0 : projectedTotal - safeBudgetLimit;
    return { projectedTotal, suggestedDaily, overage, remainingDays, phase };
  }, [budgetItems, now, remaining, safeBudgetLimit, spent, tripProgress]);

  // ── 類別支出分佈（pie chart 用，useMemo）──
  const { categoryData, grandTotal } = useMemo(() => {
    const data = Object.entries(CATEGORIES).map(([key, cat]) => {
      const total = budgetItems
        .filter(item => normalizeBudgetCategory(item.category) === key)
        .reduce(
          (sum, item) => {
            const amount = normalizeYenAmount(item.amount);
            return amount === null ? sum : addYenSafely(sum, amount);
          },
          0,
        );
      return { key, ...cat, total };
    }).filter(c => c.total > 0);
    return { categoryData: data, grandTotal: data.reduce((sum, c) => addYenSafely(sum, c.total), 0) };
  }, [budgetItems]);

  const splitSummary = useMemo(() => {
    const balances = Object.fromEntries(TRIP_TRAVELERS.map((person) => [person, 0])) as Record<string, number>;
    let trackedItems = 0;
    for (const item of budgetItems) {
      const validAmount = normalizeYenAmount(item.amount);
      const itemParticipants = item.participants?.filter((person) => TRIP_TRAVELERS.includes(person as (typeof TRIP_TRAVELERS)[number]));
      if (validAmount === null || !item.payer || !TRIP_TRAVELERS.includes(item.payer as (typeof TRIP_TRAVELERS)[number]) || !itemParticipants?.length) continue;
      trackedItems += 1;
      balances[item.payer] += validAmount;
      const share = validAmount / itemParticipants.length;
      itemParticipants.forEach((person) => { balances[person] -= share; });
    }
    const debtors = Object.entries(balances).filter(([, value]) => value < -0.5).map(([name, value]) => ({ name, amount: -value }));
    const creditors = Object.entries(balances).filter(([, value]) => value > 0.5).map(([name, value]) => ({ name, amount: value }));
    const settlements: Array<{ from: string; to: string; amount: number }> = [];
    for (const debtor of debtors) {
      for (const creditor of creditors) {
        if (debtor.amount <= 0.5 || creditor.amount <= 0.5) continue;
        const amount = Math.min(debtor.amount, creditor.amount);
        settlements.push({ from: debtor.name, to: creditor.name, amount: Math.round(amount) });
        debtor.amount -= amount;
        creditor.amount -= amount;
      }
    }
    return { balances, trackedItems, settlements };
  }, [budgetItems]);

  if (!isLoaded) return null;

  const formatTwd = (yen: number) => `NT$${Math.round(yen / jpyPerTwd).toLocaleString()}`;

  const resetExpenseForm = () => {
    setName("");
    setAmount("");
    setCategory("food");
    setExpenseDate(getTokyoBudgetDate());
    setPayer(TRIP_TRAVELERS[0]);
    setParticipants([...TRIP_TRAVELERS]);
    setEditingId(null);
    setAmountError("");
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = normalizeYenAmount(amount);
    if (!name.trim() || parsedAmount === null) {
      setAmountError(`請輸入 1～${MAX_YEN_AMOUNT.toLocaleString()} 的有效金額`);
      return;
    }

    const normalizedDate = normalizeBudgetDate(expenseDate);
    if (!normalizedDate) {
      setAmountError("請選擇有效的支出日期");
      return;
    }
    if (participants.length === 0) {
      setAmountError("請至少選擇一位分攤對象");
      return;
    }

    const newItem = createBudgetItem({
      id: editingId ?? Date.now(),
      name,
      amount: parsedAmount,
      category,
      date: normalizedDate,
      payer,
      participants,
    });
    if (!newItem) {
      setAmountError("支出資料無法建立，請重新確認日期、金額與分攤對象");
      return;
    }

    updateBudgetItems((prev) => editingId === null
      ? [newItem, ...prev]
      : prev.map((item) => item.id === editingId ? { ...item, ...newItem, id: item.id, syncId: item.syncId } : item));
    resetExpenseForm();
  };

  const handleEdit = (item: BudgetItem) => {
    setEditingId(item.id);
    setName(item.name);
    setAmount(String(item.amount));
    setCategory(normalizeBudgetCategory(item.category));
    setExpenseDate(normalizeBudgetDate(item.date) ?? getTokyoBudgetDate());
    setPayer(item.payer && TRIP_TRAVELERS.includes(item.payer as (typeof TRIP_TRAVELERS)[number]) ? item.payer : TRIP_TRAVELERS[0]);
    setParticipants(item.participants?.filter((person) => TRIP_TRAVELERS.includes(person as (typeof TRIP_TRAVELERS)[number])).length
      ? item.participants!.filter((person) => TRIP_TRAVELERS.includes(person as (typeof TRIP_TRAVELERS)[number]))
      : [...TRIP_TRAVELERS]);
    setAmountError("");
    document.getElementById("budget-add-form")?.scrollIntoView?.({ behavior: "smooth", block: "center" });
  };

  const saveBudgetLimit = () => {
    const parsedLimit = normalizeYenAmount(tempLimit);
    if (parsedLimit === null) {
      setLimitError(`請輸入 1～${MAX_YEN_AMOUNT.toLocaleString()} 的總預算`);
      return;
    }
    setBudgetLimit(parsedLimit);
    setLimitError("");
    setIsEditingLimit(false);
  };

  const handleDelete = async (id: BudgetItem["id"]) => {
    const ok = await confirm({
      title: "刪除支出",
      message: "確定要刪除這筆支出嗎？",
      accent: "danger",
      confirmText: "刪除",
    });
    if (!ok) return;
    const index = budgetItems.findIndex((item) => item.id === id);
    const item = budgetItems[index];
    if (!item) return;
    updateBudgetItems((prev) => prev.filter((entry) => entry.id !== id));
    if (editingId === id) resetExpenseForm();
    setDeletedItem({ item, index });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undoTimerRef.current = setTimeout(() => setDeletedItem(null), 6_000);
  };

  const undoDelete = () => {
    if (!deletedItem) return;
    updateBudgetItems((prev) => {
      if (prev.some((item) => item.id === deletedItem.item.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(deletedItem.index, next.length), 0, deletedItem.item);
      return next;
    });
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setDeletedItem(null);
  };

  return (
    <section id="budget" className="py-4 md:py-8 max-w-5xl mx-auto scroll-mt-28">
      <div className="trip-card bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">

        {/* Stats Row - Legible & Compact */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl relative group border border-transparent">
            <div className="text-sm font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Wallet className="w-2.5 h-2.5" /> 總預算
            </div>
            {isEditingLimit ? (
              <div className="flex items-center gap-1">
                <label htmlFor="budget-limit" className="sr-only">總預算金額</label>
                <input
                  id="budget-limit"
                  type="number"
                  min="1"
                  max={MAX_YEN_AMOUNT}
                  step="100"
                  inputMode="numeric"
                  value={tempLimit}
                  onChange={(e) => { setTempLimit(e.target.value); setLimitError(""); }}
                  aria-invalid={Boolean(limitError)}
                  aria-describedby={limitError ? "budget-limit-error" : undefined}
                  className="w-full bg-white dark:bg-slate-800 border-2 border-primary rounded-xl p-1.5 text-base font-black focus:outline-none"
                  autoFocus
                />
                <button aria-label="儲存總預算" onClick={saveBudgetLimit} className="min-w-11 min-h-11 flex items-center justify-center text-primary p-1 bg-white dark:bg-slate-800 rounded-xl shadow-sm">
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-base sm:text-lg font-black leading-tight">¥{safeBudgetLimit.toLocaleString()}</div>
                  <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mt-1">約 {formatTwd(safeBudgetLimit)}</div>
                </div>
                <button aria-label="編輯總預算" onClick={() => { setTempLimit(safeBudgetLimit.toString()); setLimitError(""); setIsEditingLimit(true); }} className="min-w-11 min-h-11 flex items-center justify-center p-1 text-gray-300 hover:text-primary transition-all rounded-xl">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {limitError && <p id="budget-limit-error" role="alert" className="mt-1 text-[11px] font-bold text-red-700 dark:text-red-300">{limitError}</p>}
          </div>

          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <CreditCard className="w-2.5 h-2.5 text-red-400" /> 已花
            </div>
            <div className="text-base sm:text-lg font-black leading-tight text-red-600 dark:text-red-400">¥{spent.toLocaleString()}</div>
            <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mt-1">約 {formatTwd(spent)}</div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <PieChart className={`w-2.5 h-2.5 ${overBudget > 0 ? "text-red-400" : "text-green-400"}`} /> {overBudget > 0 ? "超支" : "剩餘"}
            </div>
            <div className={`text-base sm:text-lg font-black leading-tight ${overBudget > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"}`}>
              ¥{(overBudget > 0 ? overBudget : remaining).toLocaleString()}
            </div>
            <div className="text-xs font-bold text-gray-600 dark:text-gray-300 mt-1">
              約 {formatTwd(overBudget > 0 ? overBudget : remaining)}
            </div>
          </div>
        </div>

        {/* Budget Prediction */}
        {spent > 0 && (
          <div className={`mb-6 p-4 rounded-2xl border ${overBudget > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800"}`}>
            <div className={`text-sm font-black mb-2 flex items-center gap-2 ${overBudget > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              <span className="text-lg">{overBudget > 0 ? "⚠️" : "💡"}</span> 預算分析
              {budgetAnalysis.phase === "ongoing" && (
                <span className="ml-auto text-xs font-bold text-gray-600 dark:text-gray-300">
                  目前第 {tripProgress.elapsedDays} 天 / 剩 {budgetAnalysis.remainingDays} 天
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-600 dark:text-gray-300">建議每日預算</div>
                <div className="text-xl font-black text-green-600 dark:text-green-400">
                  ¥{budgetAnalysis.suggestedDaily.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-600 dark:text-gray-300">
                  {budgetAnalysis.phase === "pre" ? "旅程前已記支出" : "預計總支出"}
                </div>
                <div className={`text-xl font-black ${budgetAnalysis.overage > 0 ? "text-red-700 dark:text-red-300" : "text-blue-700 dark:text-blue-300"}`}>
                  ¥{(budgetAnalysis.projectedTotal ?? spent).toLocaleString()}
                </div>
              </div>
            </div>
            {overBudget > 0 ? (
              <div className="mt-3 text-sm text-red-600 dark:text-red-400 font-black" role="alert">
                已超支 ¥{overBudget.toLocaleString()}，請調整總預算或刪除誤記項目。
              </div>
            ) : budgetAnalysis.phase === "ongoing" && budgetAnalysis.overage > 0 && (
              <div className="mt-3 text-xs text-red-600 dark:text-red-400 font-bold">
                ⚠️ 以目前速度，您可能會超支約 ¥{Math.round(budgetAnalysis.overage).toLocaleString()}
              </div>
            )}
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-8 px-1">
          <div className="flex justify-between text-sm font-black uppercase tracking-widest mb-2">
            <span className="text-gray-600 dark:text-gray-300">進度</span>
            <span className={percentage > 90 ? "text-red-700 dark:text-red-300" : "text-primary"}>{percentage.toFixed(1)}%</span>
          </div>
          <div className="w-full h-2.5 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden shadow-inner">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${percentage > 90 ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.4)]" : "bg-primary shadow-[0_0_8px_rgba(231,76,60,0.4)]"}`}
              style={{ width: `${percentage}%` }}
            ></div>
          </div>
        </div>

        {/* Category Pie Chart */}
        {budgetItems.length > 0 && grandTotal > 0 && (() => {
          // SVG Pie Chart using stroke-dasharray technique
          const radius = 60;
          const circumference = 2 * Math.PI * radius;
          let offset = 0;

          return (
            <div className="mb-8 bg-gray-50 dark:bg-slate-900 rounded-[2rem] p-5 border border-gray-100 dark:border-slate-800">
              <div className="text-sm font-black text-gray-600 dark:text-gray-300 uppercase tracking-widest mb-4">
                類別支出比例
              </div>
              <div className="flex items-center gap-6">
                {/* SVG Donut Chart */}
                <div className="relative flex-shrink-0">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle
                      cx="70" cy="70" r={radius}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="16"
                      className="text-gray-100 dark:text-slate-800"
                    />
                    {categoryData.map((cat) => {
                      const percent = cat.total / grandTotal;
                      const dash = percent * circumference;
                      const currentOffset = offset;
                      offset += dash;
                      return (
                        <circle
                          key={cat.key}
                          cx="70" cy="70" r={radius}
                          fill="none"
                          stroke={cat.color}
                          strokeWidth="16"
                          strokeDasharray={`${dash} ${circumference - dash}`}
                          strokeDashoffset={-currentOffset}
                          strokeLinecap="butt"
                          transform="rotate(-90 70 70)"
                          className="transition-all duration-700"
                        />
                      );
                    })}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300">總計</span>
                    <span className="text-sm font-black">¥{grandTotal.toLocaleString()}</span>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex-1 grid grid-cols-2 gap-x-4 gap-y-2.5">
                  {categoryData.map((cat) => {
                    const percent = ((cat.total / grandTotal) * 100).toFixed(1);
                    return (
                      <div key={cat.key} className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full flex-shrink-0"
                          style={{ backgroundColor: cat.color }}
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 truncate">{cat.label}</span>
                          </div>
                          <div className="text-xs text-gray-600 dark:text-gray-300">
                            <span className="font-black">{percent}%</span>
                            <span className="ml-1">¥{cat.total.toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {splitSummary.trackedItems > 0 && (
          <div className="mb-6 rounded-[2rem] border border-blue-200 bg-blue-50 p-5 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <h3 className="font-black text-blue-950 dark:text-blue-100">👥 共同分帳結算</h3>
                <p className="mt-1 text-xs font-bold text-blue-800 dark:text-blue-200">已計入 {splitSummary.trackedItems} 筆有設定付款人與分攤對象的支出；舊紀錄不會被猜測。</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              {TRIP_TRAVELERS.map((person) => {
                const balance = splitSummary.balances[person] ?? 0;
                return (
                  <div key={person} className="rounded-2xl bg-white p-3 dark:bg-slate-800">
                    <div className="text-sm font-black text-gray-900 dark:text-white">{person}</div>
                    <div className={`mt-1 text-lg font-black tabular-nums ${balance > 0.5 ? "text-emerald-700 dark:text-emerald-300" : balance < -0.5 ? "text-red-700 dark:text-red-300" : "text-gray-600 dark:text-gray-300"}`}>
                      {balance > 0.5 ? `應收 ¥${Math.round(balance).toLocaleString()}` : balance < -0.5 ? `應付 ¥${Math.round(-balance).toLocaleString()}` : "已結清"}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="space-y-2">
              {splitSummary.settlements.length > 0 ? splitSummary.settlements.map((settlement) => (
                <div key={`${settlement.from}-${settlement.to}`} className="flex items-center justify-between gap-3 rounded-xl bg-blue-100 px-3 py-2.5 text-sm font-black text-blue-950 dark:bg-blue-900/30 dark:text-blue-100">
                  <span>{settlement.from} → {settlement.to}</span>
                  <span className="tabular-nums">¥{settlement.amount.toLocaleString()} <span className="text-xs font-bold">（約 {formatTwd(settlement.amount)}）</span></span>
                </div>
              )) : (
                <p className="rounded-xl bg-emerald-100 px-3 py-2.5 text-sm font-black text-emerald-900 dark:bg-emerald-900/30 dark:text-emerald-200">目前不用轉帳，兩人已結清。</p>
              )}
            </div>
          </div>
        )}

        {/* Scan Receipt Button */}
        <button
          onClick={() => setShowScanner(true)}
          className="w-full mb-4 flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all hover:shadow-xl hover:shadow-primary/30"
        >
          <ScanLine className="w-5 h-5" />
          <span>掃描發票自動記帳</span>
        </button>

        <button
          type="button"
          onClick={() => {
            const form = document.getElementById("budget-add-form");
            form?.scrollIntoView({ behavior: "smooth", block: "center" });
            form?.querySelector<HTMLInputElement>("#budget-item-name")?.focus();
          }}
          className="md:hidden w-full mb-4 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 font-black text-primary active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          快速記一筆
        </button>

        {/* Form - Legible Inputs */}
        <form
          id="budget-add-form"
          onSubmit={handleAdd}
          className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-8 bg-gray-50 dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 min-w-0 w-full overflow-hidden"
        >
          {editingId !== null && (
            <div className="w-full flex items-center justify-between gap-3 rounded-2xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 px-4 py-2.5">
              <span className="text-sm font-black text-orange-800 dark:text-orange-200">正在編輯「{name}」</span>
              <button type="button" onClick={resetExpenseForm} className="inline-flex min-h-11 items-center gap-1 px-3 rounded-xl text-sm font-black text-orange-800 dark:text-orange-200 hover:bg-orange-100 dark:hover:bg-orange-900/40">
                <X className="w-4 h-4" /> 取消
              </button>
            </div>
          )}
          {/* 類別 + 項目名稱：min-w-0 避免 flex 子元素被內容撐爆 */}
          <div className="flex flex-1 min-w-0 gap-2">
            <label htmlFor="budget-category" className="sr-only">支出類別</label>
            <select
              id="budget-category"
              aria-label="支出類別"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="p-3 w-14 shrink-0 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-3xl appearance-none text-center"
            >
              {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>{cat.icon} {cat.label}</option>
              ))}
            </select>
            <label htmlFor="budget-item-name" className="sr-only">項目名稱</label>
            <input
              id="budget-item-name"
              type="text"
              placeholder="項目名稱"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 min-w-0 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold focus:ring-2 focus:ring-primary/20 outline-none"
              required
            />
          </div>
          {/* 金額 + 新增鈕：min-w-0 + shrink-0 避免在窄螢幕把 + 按鈕推出卡片邊界 */}
          <div className="flex min-w-0 gap-2">
            <label htmlFor="budget-amount" className="sr-only">金額（日圓）</label>
            <input
              id="budget-amount"
              type="number"
              min="1"
              max={MAX_YEN_AMOUNT}
              step="1"
              inputMode="numeric"
              placeholder="金額"
              value={amount}
              onChange={(e) => { setAmount(e.target.value); setAmountError(""); }}
              aria-invalid={Boolean(amountError)}
              aria-describedby={amountError ? "budget-amount-error" : undefined}
              className="flex-1 min-w-0 sm:w-28 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-black focus:ring-2 focus:ring-primary/20 outline-none"
              required
            />
            <button
              type="submit"
              aria-label={editingId === null ? "新增支出" : "儲存支出變更"}
              className="shrink-0 bg-primary hover:bg-primary-dark text-white p-3 sm:px-6 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              {editingId === null ? <Plus className="w-5 h-5 sm:w-6 sm:h-6" /> : <Check className="w-5 h-5 sm:w-6 sm:h-6" />}
            </button>
          </div>
          <div className="w-full grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2 pt-1">
            <div>
              <label htmlFor="budget-expense-date" className="text-xs font-black text-gray-600 dark:text-gray-300 block mb-1 ml-1">實際支出日期</label>
              <input
                id="budget-expense-date"
                type="date"
                value={expenseDate}
                onChange={(event) => { setExpenseDate(event.target.value); setAmountError(""); }}
                className="w-full min-h-11 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                required
              />
            </div>
            <fieldset>
              <legend className="text-xs font-black text-gray-600 dark:text-gray-300 mb-1 ml-1">快速選擇旅程日</legend>
              <div className="flex gap-1 overflow-x-auto scrollbar-hide snap-x" aria-label="快速選擇 Day 1 至 Day 6">
                {Array.from({ length: TRIP_TOTAL_DAYS }, (_, index) => {
                  const day = index + 1;
                  const date = getBudgetDateForTripDay(day)!;
                  return (
                    <button
                      key={date}
                      type="button"
                      aria-pressed={expenseDate === date}
                      onClick={() => setExpenseDate(date)}
                      className={`min-h-11 shrink-0 snap-start px-3 rounded-xl text-xs font-black border ${expenseDate === date
                        ? "bg-primary text-white border-primary"
                        : "bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-slate-700"}`}
                    >
                      D{day}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
          <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-2xl border border-blue-100 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950/20">
            <div>
              <label htmlFor="budget-payer" className="text-xs font-black text-blue-900 dark:text-blue-200 block mb-1">付款人</label>
              <select id="budget-payer" value={payer} onChange={(event) => setPayer(event.target.value)} className="min-h-11 w-full rounded-xl border border-blue-200 bg-white px-3 font-bold text-gray-900 dark:border-blue-900 dark:bg-slate-800 dark:text-white">
                {TRIP_TRAVELERS.map((person) => <option key={person} value={person}>{person}</option>)}
              </select>
            </div>
            <fieldset>
              <legend className="text-xs font-black text-blue-900 dark:text-blue-200 mb-1">分攤對象</legend>
              <div className="grid grid-cols-2 gap-2">
                {TRIP_TRAVELERS.map((person) => {
                  const selected = participants.includes(person);
                  return (
                    <button
                      key={person}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setParticipants((prev) => selected ? prev.filter((entry) => entry !== person) : [...prev, person])}
                      className={`min-h-11 rounded-xl border px-3 text-sm font-black ${selected ? "border-blue-700 bg-blue-700 text-white" : "border-blue-200 bg-white text-blue-900 dark:border-blue-900 dark:bg-slate-800 dark:text-blue-200"}`}
                    >
                      {selected && <Check className="inline w-4 h-4 mr-1" />} {person}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>
          {amountError && (
            <p id="budget-amount-error" role="alert" className="w-full text-sm font-bold text-red-700 dark:text-red-300 px-1">
              {amountError}
            </p>
          )}
        </form>

        {/* List - Readable text */}
        <div className="space-y-3 md:max-h-[500px] md:overflow-y-auto md:pr-1 custom-scrollbar">
          {budgetItems.length === 0 ? (
            <div className="text-center text-gray-600 dark:text-slate-300 py-12 text-base border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-[2.5rem] font-bold">
              目前尚無任何記帳紀錄
            </div>
          ) : (
            budgetItems.map((item) => (
              <div key={item.id} className="flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-white dark:bg-slate-800 border border-gray-50 dark:border-slate-700 rounded-2xl shadow-sm group">
                <div className="text-2xl sm:text-3xl bg-gray-50 dark:bg-slate-900 w-10 h-10 sm:w-12 sm:h-12 flex-shrink-0 flex items-center justify-center rounded-2xl shadow-inner">
                  {CATEGORIES[item.category as keyof typeof CATEGORIES]?.icon || "💡"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-black text-sm sm:text-base text-gray-900 dark:text-white leading-tight truncate">{item.name}</div>
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">{normalizeBudgetDate(item.date) ?? item.date}</span>
                    {getBudgetTripDayLabel(item.date) && (
                      <span className="rounded-full bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 text-[11px] font-black text-blue-700 dark:text-blue-300">{getBudgetTripDayLabel(item.date)}</span>
                    )}
                    {item.payer && item.participants?.length ? (
                      <span className="rounded-full bg-violet-100 dark:bg-violet-900/30 px-2 py-0.5 text-[11px] font-black text-violet-800 dark:text-violet-200">{item.payer} 付款 · {item.participants.length} 人分</span>
                    ) : (
                      <span className="rounded-full bg-gray-100 dark:bg-slate-700 px-2 py-0.5 text-[11px] font-bold text-gray-600 dark:text-gray-300">未設定分攤</span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`font-black text-sm sm:text-base tabular-nums whitespace-nowrap ${normalizeYenAmount(item.amount) === null ? "text-red-700 dark:text-red-300" : ""}`}>
                    {normalizeYenAmount(item.amount) === null
                      ? "無效金額"
                      : `¥${normalizeYenAmount(item.amount)!.toLocaleString()}`}
                  </div>
                  {normalizeYenAmount(item.amount) !== null && (
                    <div className="text-[11px] font-bold text-gray-600 dark:text-gray-300 tabular-nums">約 {formatTwd(normalizeYenAmount(item.amount)!)}</div>
                  )}
                </div>
                <button onClick={() => handleEdit(item)} aria-label={`編輯「${item.name}」`} className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-gray-500 hover:text-primary rounded-xl transition-all">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(item.id)} aria-label={`刪除「${item.name}」`} className="w-11 h-11 flex-shrink-0 flex items-center justify-center text-gray-300 hover:text-red-500 rounded-xl transition-all">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Receipt Scanner Modal */}
      {showScanner && (
        <ReceiptScanner
          onScanComplete={handleScanComplete}
          onClose={() => setShowScanner(false)}
        />
      )}

      {deletedItem && (
        <div role="status" aria-live="polite" className="fixed bottom-[calc(5.5rem+var(--sab))] lg:bottom-[calc(1rem+var(--sab))] left-1/2 z-[90] flex w-[calc(100%-2rem)] max-w-md -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-white shadow-2xl">
          <span className="min-w-0 flex-1 truncate text-sm font-bold">已刪除「{deletedItem.item.name}」</span>
          <button type="button" onClick={undoDelete} className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-black hover:bg-white/20">
            <RotateCcw className="w-4 h-4" /> 復原
          </button>
        </div>
      )}
    </section>
  );
}
