"use client";

import { useState, useCallback } from "react";
import { Trash2, Pencil, Check, Plus, PieChart, CreditCard, Wallet, ScanLine } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { ReceiptScanner, ReceiptItem } from "@/components/ReceiptScanner";

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

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("food");
  const [isEditingLimit, setIsEditingLimit] = useState(false);
  const [tempLimit, setTempLimit] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  const handleScanComplete = useCallback((scannedItems: ReceiptItem[]) => {
    const newItems = scannedItems.map((item, index) => ({
      id: Date.now() + index,
      name: item.name,
      amount: item.amount,
      category: item.category,
      date: new Date().toLocaleDateString("zh-TW"),
    }));
    updateBudgetItems([...newItems, ...budgetItems]);
  }, [budgetItems, updateBudgetItems]);

  if (!isLoaded) return null;

  const spent = budgetItems.reduce((sum, item) => sum + item.amount, 0);
  const remaining = Math.max(budgetLimit - spent, 0);
  const percentage = Math.min((spent / budgetLimit) * 100, 100);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !amount) return;

    const newItem = {
      id: Date.now(),
      name,
      amount: parseInt(amount, 10),
      category,
      date: new Date().toLocaleDateString("zh-TW"),
    };

    updateBudgetItems([newItem, ...budgetItems]);
    setName("");
    setAmount("");
  };

  const handleDelete = (id: number) => {
    if (!confirm("確定要刪除這筆支出嗎？")) return;
    updateBudgetItems(budgetItems.filter((item) => item.id !== id));
  };

  return (
    <section id="tools" className="py-4 px-4 md:px-12 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">
        
        {/* Stats Row - Legible & Compact */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl relative group border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <Wallet className="w-2.5 h-2.5" /> 總預算
            </div>
            {isEditingLimit ? (
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={tempLimit}
                  onChange={(e) => setTempLimit(e.target.value)}
                  className="w-full bg-white dark:bg-slate-800 border-2 border-primary rounded-xl p-1.5 text-base font-black focus:outline-none"
                  autoFocus
                />
                <button onClick={() => { setBudgetLimit(parseInt(tempLimit, 10)); setIsEditingLimit(false); }} className="text-primary p-1 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                  <Check className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="text-base sm:text-lg font-black leading-tight ">¥{budgetLimit.toLocaleString()}</div>
                <button onClick={() => { setTempLimit(budgetLimit.toString()); setIsEditingLimit(true); }} className="p-1 text-gray-300 hover:text-primary transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          
          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <CreditCard className="w-2.5 h-2.5 text-red-400" /> 已花
            </div>
            <div className="text-base sm:text-lg font-black leading-tight text-red-500 ">¥{spent.toLocaleString()}</div>
          </div>

          <div className="bg-gray-50 dark:bg-slate-900 p-4 rounded-3xl border border-transparent">
            <div className="text-sm font-black text-gray-400 uppercase tracking-widest mb-1.5 flex items-center gap-1">
                <PieChart className="w-2.5 h-2.5 text-green-400" /> 剩餘
            </div>
            <div className="text-base sm:text-lg font-black leading-tight text-green-500 ">¥{remaining.toLocaleString()}</div>
          </div>
        </div>

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
        {budgetItems.length > 0 && (() => {
          const categoryData = Object.entries(CATEGORIES).map(([key, cat]) => {
            const total = budgetItems
              .filter(item => item.category === key)
              .reduce((sum, item) => sum + item.amount, 0);
            return { key, ...cat, total };
          }).filter(c => c.total > 0);

          const grandTotal = categoryData.reduce((sum, c) => sum + c.total, 0);
          if (grandTotal === 0) return null;

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
        <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2 mb-8 bg-gray-50 dark:bg-slate-900 p-4 rounded-[2rem] border border-gray-100 dark:border-slate-800">
          <div className="flex flex-1 gap-2">
            <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="p-3 w-14 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-3xl appearance-none text-center"
            >
                {Object.entries(CATEGORIES).map(([key, cat]) => (
                <option key={key} value={key}>{cat.icon}</option>
                ))}
            </select>
            <input
                type="text"
                placeholder="項目名稱"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="flex-1 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-bold focus:ring-2 focus:ring-primary/20 outline-none"
                required
            />
          </div>
          <div className="flex gap-2">
            <input
                type="number"
                placeholder="金額"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="flex-1 sm:w-28 p-3 rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-base font-black focus:ring-2 focus:ring-primary/20 outline-none"
                required
            />
            <button type="submit" className="bg-primary hover:bg-primary-dark text-white p-3 px-6 rounded-2xl font-black shadow-lg shadow-primary/20 active:scale-95 transition-all">
                <Plus className="w-6 h-6" />
            </button>
          </div>
        </form>

        {/* List - Readable text */}
        <div className="space-y-3 max-h-[350px] md:max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
          {budgetItems.length === 0 ? (
            <div className="text-center text-gray-400 py-12 text-base italic border-2 border-dashed border-gray-50 dark:border-slate-900 rounded-[2.5rem]">
              目前尚無任何記帳紀錄
            </div>
          ) : (
            budgetItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 border border-gray-50 dark:border-slate-700 rounded-2xl shadow-sm group">
                <div className="flex items-center gap-4">
                  <div className="text-3xl bg-gray-50 dark:bg-slate-900 w-12 h-12 flex items-center justify-center rounded-2xl shadow-inner">
                    {CATEGORIES[item.category as keyof typeof CATEGORIES]?.icon || "💡"}
                  </div>
                  <div>
                    <div className="font-black text-base text-gray-900 dark:text-white leading-tight">{item.name}</div>
                    <div className="text-sm font-bold text-gray-400 uppercase tracking-widest">{item.date}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <span className="font-black text-base">¥{item.amount.toLocaleString()}</span>
                  <button onClick={() => handleDelete(item.id)} className="text-gray-300 hover:text-red-500 p-2 transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
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
    </section>
  );
}
