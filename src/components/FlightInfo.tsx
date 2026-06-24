"use client";

import { useEffect, useState } from "react";
import { PlaneTakeoff, PlaneLanding, Clock, Calendar, Star, Info, Loader2 } from "lucide-react";

type LiveFlightData = {
  gate: string;
  status: string;
  terminal: string;
  time: string;
  actualTime?: string;
};

export function FlightInfo() {
  const [liveData, setLiveData] = useState<LiveFlightData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFlight() {
      try {
        const res = await fetch("/api/flight-info");
        const data = await res.json();
        if (data.gate) {
          setLiveData(data);
        }
      } catch (e) {
        console.error("Failed to load live flight data", e);
      } finally {
        setLoading(false);
      }
    }
    fetchFlight();
  }, []);

  return (
    <section id="flights" className="py-8 px-4 md:px-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      <div className="text-center mb-10">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Live Flight Status</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">✈️ 航班資訊</h2>
        <p className="text-gray-500 font-bold flex items-center justify-center gap-2">
            <Star className="w-4 h-4 fill-primary text-primary" /> 星宇航空 STARLUX Airlines
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
        {/* Departure */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-primary"></div>
          
          <div className="flex justify-between items-start mb-8">
            <h3 className="text-2xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
              <PlaneTakeoff className="w-6 h-6 text-primary" /> 去程航班
            </h3>
            {/* Live Badge */}
            <div className="flex flex-col items-end">
                <div className="bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border border-green-500/20">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Live Status
                </div>
                {loading ? (
                    <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> 正在讀取登機門...
                    </div>
                ) : liveData ? (
                    <div className="mt-2 text-right">
                        <span className="text-sm font-bold text-gray-400 block">登機門 / GATE</span>
                        <span className="text-3xl font-black text-primary leading-none">{liveData.gate}</span>
                    </div>
                ) : (
                    <div className="mt-2 text-sm text-gray-400 italic">登機門尚未公佈</div>
                )}
            </div>
          </div>
          
          <div className="flex items-center justify-between mb-10 relative">
            <div className="text-center z-10">
              <div className="text-4xl font-black mb-1 tracking-tighter">TPE</div>
              <div className="text-sm font-bold text-gray-400 uppercase">Taipei</div>
              <div className="text-3xl font-black text-primary mt-3 bg-primary/5 py-1 rounded-xl">08:30</div>
            </div>
            
            <div className="flex-1 px-4 relative flex flex-col items-center gap-2">
                <div className="w-full h-px border-t-2 border-dashed border-gray-200 dark:border-slate-600 relative">
                    <PlaneTakeoff className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-primary w-8 h-8 bg-white dark:bg-slate-800 p-1 rounded-full border border-gray-100 dark:border-slate-700 shadow-sm" />
                </div>
                <span className="text-sm font-black text-gray-400 uppercase tracking-widest mt-4">3h 25m</span>
            </div>
            
            <div className="text-center z-10">
              <div className="text-4xl font-black mb-1 tracking-tighter">NRT</div>
              <div className="text-sm font-bold text-gray-400 uppercase">Tokyo</div>
              <div className="text-3xl font-black text-primary mt-3 bg-primary/5 py-1 rounded-xl">12:55</div>
            </div>
          </div>
          
          <div className="space-y-3 pt-6 border-t border-gray-50 dark:border-slate-700/50">
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> 出發日期</span>
                <span className="font-black text-gray-700 dark:text-gray-200">2026 / 09 / 01 (二)</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> 航班編號</span>
                <span className="font-black text-gray-700 dark:text-gray-200">JX 800</span>
             </div>
             {liveData && (
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航班狀態</span>
                    <span className={`font-black ${liveData.status.includes('延遲') ? 'text-red-500' : 'text-green-500'}`}>{liveData.status}</span>
                </div>
             )}
          </div>
        </div>

        {/* Return */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-gray-100 dark:border-slate-700 relative overflow-hidden group opacity-80">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-accent"></div>
          <h3 className="text-2xl font-black flex items-center gap-3 mb-8 text-gray-900 dark:text-white">
            <PlaneLanding className="w-6 h-6 text-accent" /> 回程航班
          </h3>
          
          <div className="flex items-center justify-between mb-10 relative">
            <div className="text-center z-10">
              <div className="text-4xl font-black mb-1 tracking-tighter">NRT</div>
              <div className="text-sm font-bold text-gray-400 uppercase">Tokyo</div>
              <div className="text-3xl font-black text-accent mt-3 bg-accent/5 py-1 rounded-xl">20:40</div>
            </div>
            
            <div className="flex-1 px-4 relative flex flex-col items-center gap-2">
                <div className="w-full h-px border-t-2 border-dashed border-gray-200 dark:border-slate-600 relative">
                    <PlaneLanding className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-accent w-8 h-8 bg-white dark:bg-slate-800 p-1 rounded-full border border-gray-100 dark:border-slate-700 shadow-sm" />
                </div>
                <span className="text-sm font-black text-gray-400 uppercase tracking-widest mt-4">3h 40m</span>
            </div>
            
            <div className="text-center z-10">
              <div className="text-4xl font-black mb-1 tracking-tighter">TPE</div>
              <div className="text-sm font-bold text-gray-400 uppercase">Taipei</div>
              <div className="text-3xl font-black text-accent mt-3 bg-accent/5 py-1 rounded-xl">23:20</div>
            </div>
          </div>
          
          <div className="space-y-3 pt-6 border-t border-gray-50 dark:border-slate-700/50">
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> 返程日期</span>
                <span className="font-black text-gray-700 dark:text-gray-200">2026 / 09 / 06 (日)</span>
             </div>
             <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> 航班編號</span>
                <span className="font-black text-gray-700 dark:text-gray-200">JX 805</span>
             </div>
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400 font-bold uppercase tracking-tighter">
         <Info className="w-3 h-3" /> Live data provided by TDX Airport FIDS API
      </div>
    </section>
  );
}
