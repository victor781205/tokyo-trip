"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import dynamic from "next/dynamic";
import { Trash2, Pencil, Check, Plus, PieChart, CreditCard, Wallet, ScanLine, Loader2 } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { useDialog } from "@/context/DialogContext";
import { getTripTimelineState } from "@/lib/trip-dates";

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
};

export function BudgetTracker() {
  const { isLoaded, budgetItems, updateBudgetItems, budgetLimit, setBudgetLimit } = useTripState();
  const { confirm } = useDialog();

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState("");
  const [limitError, setLimitError] = useState("");
  const [amountError, setAmountError] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const handleScanComplete = useCallback((scannedItems: ReceiptItem[]) => {
    const newItems = scannedItems
      .filter((item) => item.name.trim() && Number.isFinite(item.amount) && item.amount > 0)
      .map((item, index) => ({
      id: Date.now() + index,
      name: item.name.trim(),
      amount: Math.round(item.amount),
      category: item.category in CATEGORIES ? item.category : "other",
      date: new Date().toLocaleDateString("zh-TW"),
    }));
    if (newItems.length > 0) updateBudgetItems([...newItems, ...budgetItems]);
  }, [budgetItems, updateBudgetItems]);

  // ── 衍生數值（useMemo，避免每次 render 重算）──
  // 注意：hooks 必須在條件 return 之前，故 isLoaded 檢查移到 useMemo 之後
  const safeBudgetLimit = Number.isFinite(budgetLimit) && budgetLimit > 0 ? budgetLimit : 0;
  const spent = useMemo(
    () => budgetItems.reduce(
      (sum, item) => sum + (Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0),
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
    // 已過天數至少 1（用來算平均日支出）
    const elapsed = Math.max(1, elapsedDays);
    // 平均每日支出
    const avgDaily = spent / elapsed;
    // 預測總支出：用平均日支出 × 總天數
    const projectedTotal = phase === "pre"
      ? null
      : phase === "done"
        ? spent
        : Math.round(avgDaily * 6);
    // 建議每日預算：剩餘金額 / 剩餘天數
    const suggestedDaily = phase === "done"
      ? 0
      : Math.round(remaining / Math.max(1, remainingDays));
    const overage = projectedTotal === null ? 0 : projectedTotal - safeBudgetLimit;
    return { projectedTotal, suggestedDaily, overage, remainingDays, phase };
  }, [remaining, safeBudgetLimit, spent, tripProgress]);

  // ── 類別支出分佈（pie chart 用，useMemo）──
  const { categoryData, grandTotal } = useMemo(() => {
    const data = Object.entries(CATEGORIES).map(([key, cat]) => {
      const total = budgetItems
        .filter(item => item.category === key)
        .reduce(
          (sum, item) => sum + (Number.isFinite(item.amount) && item.amount > 0 ? item.amount : 0),
          0,
        );
      return { key, ...cat, total };
    }).filter(c => c.total > 0);
    return { categoryData: data, grandTotal: data.reduce((sum, c) => sum + c.total, 0) };
  }, [budgetItems]);

  if (!isLoaded) return null;

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    if (!name.trim() || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAmountError("請輸入大於 0 的有效金額");
      return;
    }

    const newItem = {
      id: Date.now(),
      name: name.trim(),
      amount: Math.round(parsedAmount),
      category,
      date: new Date().toLocaleDateString("zh-TW"),
    };

    updateBudgetItems([newItem, ...budgetItems]);
    setName("");
    setAmount("");
    setAmountError("");
  };

  const saveBudgetLimit = () => {
    const parsedLimit = Number(tempLimit);
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
      setLimitError("請輸入大於 0 的總預算");
      return;
    }
    setBudgetLimit(Math.round(parsedLimit));
    setLimitError("");
    setIsEditingLimit(false);
  };

  const handleDelete = async (id: number) => {
    const ok = await confirm({
      title: "刪除支出",
      message: "確定要刪除這筆支出嗎？",
      accent: "danger",
      confirmText: "刪除",
    });
    if (!ok) return;
    updateBudgetItems(budgetItems.filter((item) => item.id !== id));
  };

  return (
    <section id="budget" className="py-4 px-4 md:px-12 max-w-5xl mx-auto scroll-mt-28">
      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">

        {/* Stats Row - Legible & Compact */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl relative group border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <Wallet className="w-2.5 h-2.5" /> 總預算
            </div>
            {isEditingLimit ? (
              <div className="flex items-center gap-1">
                <label htmlFor="budget-limit" className="sr-only">總預算金額</label>
                <input
                  id="budget-limit"
                  type="number"
                  min="1"
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
                <div className="text-base sm:text-lg font-black leading-tight ">¥{safeBudgetLimit.toLocaleString()}</div>
                <button aria-label="編輯總預算" onClick={() => { setTempLimit(safeBudgetLimit.toString()); setLimitError(""); setIsEditingLimit(true); }} className="min-w-11 min-h-11 flex items-center justify-center p-1 text-gray-300 hover:text-primary transition-all rounded-xl">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            {limitError && <p id="budget-limit-error" role="alert" className="mt-1 text-[11px] font-bold text-red-500">{limitError}</p>}
          </div>

          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <CreditCard className="w-2.5 h-2.5 text-red-400" /> 已花
            </div>
            <div className="text-base sm:text-lg font-black leading-tight text-red-500 ">¥{spent.toLocaleString()}</div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
              <PieChart className={`w-2.5 h-2.5 ${overBudget > 0 ? "text-red-400" : "text-green-400"}`} /> {overBudget > 0 ? "超支" : "剩餘"}
            </div>
            <div className={`text-base sm:text-lg font-black leading-tight ${overBudget > 0 ? "text-red-500" : "text-green-500"}`}>
              ¥{(overBudget > 0 ? overBudget : remaining).toLocaleString()}
            </div>
          </div>
        </div>

        {/* Budget Prediction */}
        {spent > 0 && (
          <div className={`mb-6 p-4 rounded-2xl border ${overBudget > 0 ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800" : "bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 border-green-200 dark:border-green-800"}`}>
            <div className={`text-sm font-black mb-2 flex items-center gap-2 ${overBudget > 0 ? "text-red-700 dark:text-red-400" : "text-green-700 dark:text-green-400"}`}>
              <span className="text-lg">{overBudget > 0 ? "⚠️" : "💡"}</span> 預算分析
              {budgetAnalysis.phase === "ongoing" && (
                <span className="ml-auto text-xs font-bold text-gray-400">
                  目前第 {tripProgress.elapsedDays} 天 / 剩 {budgetAnalysis.remainingDays} 天
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-500 dark:text-gray-400">建議每日預算</div>
                <div className="text-xl font-black text-green-600 dark:text-green-400">
                  ¥{budgetAnalysis.suggestedDaily.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-gray-500 dark:text-gray-400">
                  {budgetAnalysis.phase === "pre" ? "旅程前已記支出" : "預計總支出"}
                </div>
                <div className={`text-xl font-black ${budgetAnalysis.overage > 0 ? "text-red-500" : "text-blue-500"}`}>
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
            <span className="text-gray-400">進度</span>
            <span className={percentage > 90 ? "text-red-500" : "text-primary"}>{percentage.toFixed(1)}%</span>
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
              <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-4">
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
                    <span className="text-xs font-bold text-gray-400">總計</span>
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
                          <div className="text-xs text-gray-400">
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

        {/* Scan Receipt Button */}
        <button
          onClick={() => setShowScanner(true)}
          className="w-full mb-4 flex items-center justify-center gap-3 py-3.5 bg-gradient-to-r from-primary to-primary-dark text-white rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all hover:shadow-xl hover:shadow-primary/30"
        >
          <ScanLine className="w-5 h-5" />
          <span>掃描發票自動記帳</span>
        </button>

        {/* Form - Legible Inputs */}
        <form
          id="budget-add-form"
          onSubmit={handleAdd}
          className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-8 bg-gray-50 dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800 min-w-0 w-full overflow-hidden"
        >
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
              aria-label="新增支出"
              className="shrink-0 bg-primary hover:bg-primary-dark text-white p-3 sm:px-6 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all"
            >
              <Plus className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
          {amountError && (
            <p id="budget-amount-error" role="alert" className="w-full text-sm font-bold text-red-500 px-1">
              {amountError}
            </p>
          )}
        </form>

        {/* List - Readable text */}
        <div className="space-y-3 max-h-[350px] md:max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {budgetItems.length === 0 ? (
            <div className="text-center text-gray-400 dark:text-slate-500 py-12 text-base border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-[2.5rem] font-bold">
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
                  <div className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">{item.date}</div>
                </div>
                <span className="font-black text-sm sm:text-base tabular-nums whitespace-nowrap flex-shrink-0">¥{item.amount.toLocaleString()}</span>
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

      {/* 手機底部 sticky 新增 CTA */}
      <div className="md:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-40 px-4 pointer-events-none">
        <button
          type="button"
          onClick={() => {
            const form = document.getElementById("budget-add-form");
            form?.scrollIntoView({ behavior: "smooth", block: "center" });
            const input = form?.querySelector<HTMLInputElement>('input[placeholder="項目名稱"]');
            input?.focus();
          }}
          className="pointer-events-auto w-full max-w-lg mx-auto flex items-center justify-center gap-2 py-3.5 rounded-2xl font-black text-white bg-primary shadow-2xl shadow-primary/40 border border-white/10 active:scale-[0.98]"
        >
          <Plus className="w-5 h-5" />
          快速記一筆
        </button>
      </div>
    </section>
  );
}
