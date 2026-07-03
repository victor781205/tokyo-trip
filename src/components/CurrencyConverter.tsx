"use client";

import { useEffect, useState, useCallback } from "react";
import { ArrowRightLeft, RefreshCw, AlertCircle, Clock, CheckCircle2 } from "lucide-react";

type RateData = {
  rate: number;
  fetchedAt: string;
  source: string;
  error?: string;
};

const REFRESH_INTERVAL = 5 * 60 * 1000; // 每 5 分鐘刷新

export function CurrencyConverter() {
  const [rateData, setRateData] = useState<RateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [twd, setTwd] = useState<string>("1000");
  const [jpy, setJpy] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string>("");

  const fetchRate = useCallback(async () => {
    setFetching(true);
    try {
      const res = await fetch("/api/currency");
      const data: RateData = await res.json();
      setRateData(data);
      const time = new Date(data.fetchedAt).toLocaleTimeString("zh-TW", {
        hour: "2-digit",
        minute: "2-digit",
      });
      setLastUpdated(time);
    } catch (e) {
      setRateData({ rate: 4.65, fetchedAt: new Date().toISOString(), source: "fallback", error: "網路錯誤" });
    } finally {
      setLoading(false);
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchRate();
    const interval = setInterval(fetchRate, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchRate]);

  // 初始化時計算 JPY
  useEffect(() => {
    if (rateData && rate !== 0) {
      setJpy((1000 * rate).toFixed(0));
    }
  }, [rateData]); // eslint-disable-line react-hooks/exhaustive-deps

  const rate = rateData?.rate ?? 0;

  const handleTwdChange = (val: string) => {
    setTwd(val);
    if (!isNaN(parseFloat(val)) && rate > 0) {
      setJpy((parseFloat(val) * rate).toFixed(0));
    } else {
      setJpy("");
    }
  };

  const handleJpyChange = (val: string) => {
    setJpy(val);
    if (!isNaN(parseFloat(val)) && rate > 0) {
      setTwd((parseFloat(val) / rate).toFixed(0));
    } else {
      setTwd("");
    }
  };

  if (loading) {
    return (
      <section id="currency" className="py-6 md:py-20 px-4 max-w-3xl mx-auto">
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-8 md:p-12 shadow-2xl text-white animate-pulse">
          <div className="h-10 w-56 bg-white/20 rounded-2xl mb-6" />
          <div className="h-24 w-full bg-white/10 rounded-2xl mb-4" />
          <div className="flex justify-center"><div className="w-10 h-10 bg-white/10 rounded-full" /></div>
          <div className="h-24 w-full bg-white/10 rounded-2xl mt-4" />
        </div>
      </section>
    );
  }

  return (
    <section id="currency" className="py-6 md:py-20 px-4 max-w-3xl mx-auto">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-8 md:p-12 shadow-2xl text-white">

        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div>
            <h2 className="text-2xl md:text-3xl font-black mb-1">💱 匯率轉換</h2>
            <p className="text-blue-200 text-sm font-bold">TWD ↔ JPY 即時匯率</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {/* 即時匯率大字 */}
            <div className="text-right">
              <div className="text-xs font-black text-blue-200 uppercase tracking-widest">目前匯率</div>
              <div className="text-3xl md:text-4xl font-black text-white tabular-nums leading-none">
                1 TWD = <span className="text-green-300">{rate.toFixed(4)}</span> JPY
              </div>
            </div>
          </div>
        </div>

        {/* 警告：使用 fallback */}
        {rateData?.error && (
          <div className="flex items-center gap-2 bg-amber-500/20 border border-amber-400/30 rounded-xl px-4 py-2.5 mb-6 text-sm font-bold text-amber-200">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {rateData.error}，顯示預設匯率 {rate.toFixed(4)}
          </div>
        )}

        {/* 轉換器主體 */}
        <div className="space-y-4">
          {/* TWD 輸入 */}
          <div className="relative">
            <label htmlFor="twd-amount" className="text-xs font-black text-blue-200 uppercase tracking-widest mb-2 block ml-1">
              新台幣 TWD
            </label>
            <div className="relative">
              <input
                id="twd-amount"
                type="number"
                value={twd}
                onChange={(e) => handleTwdChange(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl p-5 text-2xl md:text-3xl font-black text-white focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30 tabular-nums"
                placeholder="0"
                inputMode="decimal"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xl font-bold text-white/40">TWD</span>
            </div>
          </div>

          {/* 交換按鈕 */}
          <div className="flex justify-center">
            <button
              onClick={() => {
                const j = jpy;
                const t = twd;
                handleJpyChange(t);
                setTwd(j);
              }}
              className="group flex items-center gap-2 bg-white/15 hover:bg-white/25 border border-white/20 text-white px-5 py-2.5 rounded-full font-black text-sm transition-all active:scale-95"
            >
              <ArrowRightLeft className="w-4 h-4 group-hover:rotate-90 transition-transform duration-300" />
              交換
            </button>
          </div>

          {/* JPY 輸入 */}
          <div className="relative">
            <label htmlFor="jpy-amount" className="text-xs font-black text-blue-200 uppercase tracking-widest mb-2 block ml-1">
              日圓 JPY
            </label>
            <div className="relative">
              <input
                id="jpy-amount"
                type="number"
                value={jpy}
                onChange={(e) => handleJpyChange(e.target.value)}
                className="w-full bg-white/10 border border-white/20 rounded-2xl p-5 text-2xl md:text-3xl font-black text-white focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30 tabular-nums"
                placeholder="0"
                inputMode="decimal"
              />
              <span className="absolute right-5 top-1/2 -translate-y-1/2 text-xl font-bold text-white/40">JPY</span>
            </div>
          </div>
        </div>

        {/* 底部：更新狀態 + 刷新按鈕 */}
        <div className="mt-8 pt-6 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-blue-200 text-xs font-bold">
            <CheckCircle2 className="w-4 h-4 text-green-300" />
            <span>
              {rateData?.source === "fallback" ? "預設匯率" : "Frankfurter (歐洲央行)"}
              {lastUpdated && ` · 更新於 ${lastUpdated}`}
            </span>
          </div>
          <button
            onClick={fetchRate}
            disabled={fetching}
            className="flex items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "更新中..." : "重新整理"}
          </button>
        </div>

        {/* 實用小工具：常用金額參考 */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="text-xs font-black text-blue-200 uppercase tracking-widest mb-3">常用金額參考</div>
          <div className="flex flex-wrap gap-2">
            {[
              { twd: "1,000", desc: "便利店零食" },
              { twd: "3,000", desc: "一餐午餐" },
              { twd: "5,000", desc: "伴手禮" },
              { twd: "10,000", desc: "一天預算" },
            ].map((item) => (
              <button
                key={item.twd}
                onClick={() => handleTwdChange(item.twd.replace(",", ""))}
                className="bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-3.5 py-2 text-sm font-bold text-white text-left transition-all active:scale-95"
              >
                <div>TWD {item.twd}</div>
                <div className="text-xs text-blue-200 font-normal">≈ ¥{(parseInt(item.twd.replace(",", "")) * rate).toFixed(0)} · {item.desc}</div>
              </button>
            ))}
          </div>
        </div>

        <p className="mt-6 text-xs text-blue-300/50 leading-relaxed text-center italic">
          * 匯率資料由 Frankfurter（歐洲央行）提供，每 5 分鐘自動更新。實際交易請以銀行/機場牌告為準。
        </p>
      </div>
    </section>
  );
}