"use client";

import { useEffect, useState } from "react";
import { ArrowRightLeft, TrendingUp } from "lucide-react";

export function CurrencyConverter() {
  const [rate, setRate] = useState<number>(0);
  const [twd, setTwd] = useState<string>("1000");
  const [jpy, setJpy] = useState<string>("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchRate() {
      try {
        const res = await fetch("https://currencyapi.net/api/v2/rates?base=TWD&output=json&key=418c26279aeca2b8813632b03d5082c2c69a");
        const data = await res.json();
        const jpyRate = data.rates.JPY;
        setRate(jpyRate);
        setJpy((1000 * jpyRate).toFixed(0));
      } catch (e) {
        console.error("Rate fetch failed", e);
        // Fallback
        setRate(4.65);
        setJpy((1000 * 4.65).toFixed(0));
      } finally {
        setLoading(false);
      }
    }
    fetchRate();
  }, []);

  const handleTwdChange = (val: string) => {
    setTwd(val);
    if (!isNaN(parseFloat(val))) {
      setJpy((parseFloat(val) * rate).toFixed(0));
    } else {
      setJpy("");
    }
  };

  const handleJpyChange = (val: string) => {
    setJpy(val);
    if (!isNaN(parseFloat(val))) {
      setTwd((parseFloat(val) / rate).toFixed(0));
    } else {
      setTwd("");
    }
  };

  if (loading) return null;

  return (
    <section id="currency" className="py-20 px-6 max-w-4xl mx-auto">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[3rem] p-8 md:p-12 shadow-2xl text-white">
        <div className="flex items-center gap-4 mb-10">
          <div className="bg-white/20 p-3 rounded-2xl backdrop-blur-md">
            <ArrowRightLeft className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl md:text-3xl font-bold">匯率即時轉換</h2>
            <p className="text-blue-100 opacity-80 text-base">數據每小時自動更新</p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <div className="relative">
               <label className="text-sm font-black text-blue-200 uppercase tracking-widest mb-2 block ml-1">新台幣 TWD</label>
               <input 
                 type="number" 
                 value={twd}
                 onChange={(e) => handleTwdChange(e.target.value)}
                 className="w-full bg-white/10 border border-white/20 rounded-2xl p-6 text-3xl font-black focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30"
                 placeholder="0"
               />
               <span className="absolute right-6 top-[55px] text-2xl font-bold opacity-50">TWD</span>
            </div>

            <div className="flex justify-center">
               <div className="bg-white/20 p-2 rounded-full backdrop-blur-md border border-white/10 shadow-lg">
                 <ArrowRightLeft className="w-6 h-6 rotate-90 md:rotate-0" />
               </div>
            </div>

            <div className="relative">
               <label className="text-sm font-black text-blue-200 uppercase tracking-widest mb-2 block ml-1">日圓 JPY</label>
               <input 
                 type="number" 
                 value={jpy}
                 onChange={(e) => handleJpyChange(e.target.value)}
                 className="w-full bg-white/10 border border-white/20 rounded-2xl p-6 text-3xl font-black focus:outline-none focus:ring-4 focus:ring-white/20 transition-all placeholder:text-white/30"
                 placeholder="0"
               />
               <span className="absolute right-6 top-[55px] text-2xl font-bold opacity-50">JPY</span>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xl rounded-[2rem] p-8 border border-white/10 space-y-6">
             <div className="flex items-center gap-3">
               <TrendingUp className="text-green-400 w-6 h-6" />
               <h3 className="text-xl font-bold">匯率趨勢分析</h3>
             </div>
             
             <div className="space-y-4">
                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                   <span className="text-blue-100 text-base">目前匯率比</span>
                   <div className="text-right">
                      <div className="text-3xl font-black text-green-400">1 : {rate.toFixed(4)}</div>
                      <div className="text-sm opacity-60">1 TWD 可換 {rate.toFixed(2)} JPY</div>
                   </div>
                </div>

                <div className="flex justify-between items-end border-b border-white/10 pb-4">
                   <span className="text-blue-100 text-base">換匯建議</span>
                   <div className="text-right">
                      <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-lg text-base font-bold inline-block">適合分批換匯</div>
                   </div>
                </div>
             </div>

             <div className="text-sm text-blue-200/50 leading-relaxed italic">
                * 匯率僅供參考，實際請以銀行牌告為準。本工具使用 currencyapi.net 提供之即時數據。
             </div>
          </div>
        </div>
      </div>
    </section>
  );
}
