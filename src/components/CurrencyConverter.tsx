"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle, CheckCircle2 } from "lucide-react";

type RateData = {
  rate: number;
  sourceUpdatedAt: string;
  retrievedAt: string;
  source: string;
  error?: string;
};

const FALLBACK_RATE: RateData = {
  rate: 4.65,
  sourceUpdatedAt: new Date(0).toISOString(),
  retrievedAt: new Date(0).toISOString(),
  source: "fallback",
  error: "網路錯誤",
};

async function requestRate(): Promise<RateData> {
  const res = await fetch("/api/currency");
  if (!res.ok) throw new Error(`Currency API returned ${res.status}`);
  const data = await res.json() as RateData;
  if (!Number.isFinite(data.rate) || data.rate <= 0 || !data.sourceUpdatedAt) {
    throw new Error("Currency API returned invalid data");
  }
  return data;
}

function formatSourceTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.getTime() === 0) return "";
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function CurrencyConverter() {
  const [rateData, setRateData] = useState<RateData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetching, setFetching] = useState(false);
  const [twd, setTwd] = useState<string>("1000");
  const [jpy, setJpy] = useState<string>("");

  const rate = rateData?.rate ?? 0;

  useEffect(() => {
    let cancelled = false;
    void requestRate()
      .then((data) => {
        if (cancelled) return;
        setJpy((1000 * data.rate).toFixed(0));
        setRateData(data);
      })
      .catch(() => {
        if (cancelled) return;
        setJpy((1000 * FALLBACK_RATE.rate).toFixed(0));
        setRateData(FALLBACK_RATE);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const refreshRate = async () => {
    setFetching(true);
    try {
      setRateData(await requestRate());
    } catch {
      setRateData(FALLBACK_RATE);
    } finally {
      setFetching(false);
    }
  };

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

  const lastUpdated = rateData ? formatSourceTime(rateData.sourceUpdatedAt) : "";

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
    <section id="currency" className="py-6 md:py-20 px-4 max-w-3xl mx-auto scroll-mt-28">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 md:p-12 shadow-2xl text-white">

        {/* Header */}
        <div className="mb-6 sm:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black mb-1">💱 匯率轉換</h2>
              <p className="text-blue-200 text-xs sm:text-sm font-bold">新台幣 ↔ 日圓 每日參考匯率</p>
            </div>
            {/* 每日參考匯率大字 */}
            <div className="sm:text-right">
              <div className="text-[10px] sm:text-xs font-black text-blue-200 uppercase tracking-widest mb-1">每日參考匯率</div>
              <div className="text-xl sm:text-3xl md:text-4xl font-black text-white tabular-nums leading-none">
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
        <div className="space-y-3 sm:space-y-4">
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
                className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-5 text-xl sm:text-2xl md:text-3xl font-black text-white focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30 tabular-nums"
                placeholder="0"
                inputMode="decimal"
              />
              <span className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-base sm:text-xl font-bold text-white/40">TWD</span>
            </div>
          </div>

          <div className="flex justify-center" aria-hidden="true">
            <span className="bg-white/10 border border-white/15 text-blue-100 px-4 py-1.5 rounded-full text-xs font-bold">雙向自動換算</span>
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
                className="w-full bg-white/10 border border-white/20 rounded-2xl p-4 sm:p-5 text-xl sm:text-2xl md:text-3xl font-black text-white focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30 tabular-nums"
                placeholder="0"
                inputMode="decimal"
              />
              <span className="absolute right-4 sm:right-5 top-1/2 -translate-y-1/2 text-base sm:text-xl font-bold text-white/40">JPY</span>
            </div>
          </div>
        </div>

        {/* 底部：更新狀態 + 刷新按鈕 */}
        <div className="mt-6 sm:mt-8 pt-5 sm:pt-6 border-t border-white/10 flex items-center justify-between gap-3 sm:gap-4 flex-wrap">
          <div className="flex items-center gap-2 text-blue-200 text-xs font-bold min-w-0">
            {rateData?.error ? (
              <AlertCircle className="w-4 h-4 text-amber-300 shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-green-300 shrink-0" />
            )}
            <span className="truncate">
              {rateData?.error
                ? `顯示預設匯率（網路暫時中斷）`
                : `每日參考匯率`}
              {lastUpdated && ` · 來源更新 ${lastUpdated}`}
            </span>
          </div>
          <button
            onClick={() => {
              void refreshRate();
            }}
            disabled={fetching}
            className="flex min-h-11 items-center gap-2 bg-white/10 hover:bg-white/20 border border-white/20 text-white px-4 py-2 rounded-xl text-sm font-bold transition-all active:scale-95 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${fetching ? "animate-spin" : ""}`} />
            {fetching ? "更新中..." : "重新整理"}
          </button>
        </div>

        {/* 實用小工具：常用金額參考 */}
        <div className="mt-6 pt-5 border-t border-white/10">
          <div className="text-xs font-black text-blue-200 uppercase tracking-widest mb-3">常用金額快速換算</div>
          {/* JPY 快捷（現場看價最常用） */}
          <div className="mb-3">
            <div className="text-[10px] font-black text-blue-200/80 uppercase tracking-widest mb-2 ml-0.5">日圓 JPY</div>
            <div className="flex flex-wrap gap-2">
              {[
                { jpy: 500, desc: "飲料／點心" },
                { jpy: 1000, desc: "便利店一趟" },
                { jpy: 1500, desc: "拉麵參考" },
                { jpy: 3000, desc: "定食／燒肉" },
                { jpy: 5000, desc: "伴手禮" },
                { jpy: 10000, desc: "半日預算" },
              ].map((item) => (
                <button
                  key={item.jpy}
                  type="button"
                  onClick={() => handleJpyChange(String(item.jpy))}
                  className="min-h-11 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-3 py-2 text-sm font-bold text-white text-left transition-all active:scale-95"
                >
                  <div className="tabular-nums">¥{item.jpy.toLocaleString()}</div>
                  <div className="text-xs text-blue-200 font-normal tabular-nums">
                    ≈ NT${rate > 0 ? (item.jpy / rate).toFixed(0) : "—"} · {item.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>
          {/* TWD 快捷 */}
          <div>
            <div className="text-[10px] font-black text-blue-200/80 uppercase tracking-widest mb-2 ml-0.5">新台幣 TWD</div>
            <div className="grid grid-cols-2 sm:flex sm:flex-wrap gap-2 sm:gap-2">
              {[
                { twd: "1,000", desc: "便利店零食飲料" },
                { twd: "3,000", desc: "一餐拉麵/定食" },
                { twd: "5,000", desc: "伴手禮小物" },
                { twd: "10,000", desc: "單日預算參考" },
              ].map((item) => (
                <button
                  key={item.twd}
                  type="button"
                  onClick={() => handleTwdChange(item.twd.replace(",", ""))}
                  className="min-h-11 bg-white/10 hover:bg-white/20 border border-white/10 rounded-xl px-3 sm:px-3.5 py-2 text-sm font-bold text-white text-left transition-all active:scale-95"
                >
                  <div className="tabular-nums">TWD {item.twd}</div>
                  <div className="text-xs text-blue-200 font-normal tabular-nums">≈ ¥{(parseInt(item.twd.replace(",", ""), 10) * rate).toFixed(0)} · {item.desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-5 sm:mt-6 text-[11px] sm:text-xs text-blue-200/60 leading-relaxed text-center italic">
          * Open Access 資料每日更新一次，僅供預算估算；實際交易請以銀行／信用卡牌告為準。{" "}
          <a
            href="https://www.exchangerate-api.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            Rates By Exchange Rate API
          </a>
        </p>
      </div>
    </section>
  );
}
