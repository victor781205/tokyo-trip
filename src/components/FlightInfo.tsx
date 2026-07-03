"use client";

import React, { useEffect, useState } from "react";
import { PlaneTakeoff, PlaneLanding, Clock, Calendar, Star, Info, Loader2, AlertTriangle } from "lucide-react";

type FlightData = {
  gate: string;
  status: string;
  terminal: string;
  time?: string;
  actualTime?: string;
  scheduled?: string;
  estimated?: string;
  actual?: string;
  delay?: string;
  error?: string;
};

type FlightResponse = {
  outbound: FlightData;
  inbound: FlightData;
};

/** 將 AviationStack status 翻譯為中文 */
function translateStatus(status: string): { text: string; color: string } {
  switch (status) {
    case "scheduled": return { text: "已排定", color: "text-blue-500" };
    case "active": return { text: "飛行中", color: "text-green-500" };
    case "landed": return { text: "已降落", color: "text-green-500" };
    case "cancelled": return { text: "已取消", color: "text-red-500" };
    case "delayed": return { text: "延遲", color: "text-red-500" };
    case "diverted": return { text: "改降", color: "text-orange-500" };
    default: return { text: status || "未知", color: "text-gray-500" };
  }
}

export function FlightInfo() {
  const [flightData, setFlightData] = useState<FlightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFlight() {
      try {
        const res = await fetch("/api/flight-info");
        if (!res.ok) throw new Error("HTTP " + res.status);
        const data: FlightResponse = await res.json();
        setFlightData(data);
        setFetchError(null);
      } catch (e) {
        console.error("Failed to load live flight data", e);
        setFetchError("無法載入航班資料，請稍後再試。");
      } finally {
        setLoading(false);
      }
    }
    fetchFlight();
  }, []);

  const outbound = flightData?.outbound;
  const inbound = flightData?.inbound;

  return (
    <section id="flights" className="py-8 px-4 md:px-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      {fetchError && (
        <div role="alert" className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-400 font-bold text-center">
          ⚠️ {fetchError}
        </div>
      )}
      <div className="text-center mb-10">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Live Flight Status</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">✈️ 航班資訊</h2>
        <p className="text-gray-500 font-bold flex items-center justify-center gap-2">
            <Star className="w-4 h-4 fill-primary text-primary" /> 星宇航空 STARLUX Airlines
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10">
        {/* ── 去程 JX 800 ── */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-primary"></div>
          
          <div className="flex justify-between items-start mb-8">
            <h3 className="text-2xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
              <PlaneTakeoff className="w-6 h-6 text-primary" /> 去程航班
            </h3>
            <div className="flex flex-col items-end">
                <div className="bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border border-green-500/20">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Live Status
                </div>
                {loading ? (
                    <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> 正在讀取登機門...
                    </div>
                ) : outbound && !outbound.error ? (
                    <div className="mt-2 text-right">
                        <span className="text-sm font-bold text-gray-400 block">登機門 / GATE</span>
                        <span className="text-3xl font-black text-primary leading-none">{outbound.gate}</span>
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
             {outbound && !outbound.error && (
                <>
                <div aria-live="polite" className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航班狀態</span>
                    <span className={`font-black ${outbound.status.includes('延遲') ? 'text-red-500' : 'text-green-500'}`}>{outbound.status}</span>
                </div>
                {outbound.terminal && (
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航廈</span>
                    <span className="font-black text-gray-700 dark:text-gray-200">第 {outbound.terminal} 航廈</span>
                </div>
                )}
                </>
             )}
          </div>
        </div>

        {/* ── 回程 JX 805 ── */}
        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 md:p-10 shadow-2xl border border-gray-100 dark:border-slate-700 relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-accent"></div>

          <div className="flex justify-between items-start mb-8">
            <h3 className="text-2xl font-black flex items-center gap-3 text-gray-900 dark:text-white">
              <PlaneLanding className="w-6 h-6 text-accent" /> 回程航班
            </h3>
            <div className="flex flex-col items-end">
                {loading ? (
                    <div className="flex items-center gap-1 text-sm text-gray-400">
                        <Loader2 className="w-3 h-3 animate-spin" /> 正在讀取登機門...
                    </div>
                ) : inbound && !inbound.error ? (
                    <>
                        <div className="bg-blue-500/10 text-blue-600 px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border border-blue-500/20">
                            <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse"></span> AviationStack
                        </div>
                        <div className="mt-2 text-right">
                            <span className="text-sm font-bold text-gray-400 block">登機門 / GATE</span>
                            <span className="text-3xl font-black text-accent leading-none">{inbound.gate}</span>
                        </div>
                    </>
                ) : (
                    <div className="text-sm text-gray-400 italic">
                        {inbound?.error?.includes("not configured") ? (
                            <span className="text-orange-400 font-bold">需設定 AVIATION_STACK_KEY</span>
                        ) : (
                            "登機門尚未公佈"
                        )}
                    </div>
                )}
            </div>
          </div>
          
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
             {inbound && !inbound.error && inbound.terminal && inbound.terminal !== "—" && (
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航廈</span>
                    <span className="font-black text-gray-700 dark:text-gray-200">第 {inbound.terminal} 航廈</span>
                </div>
             )}
             {inbound && !inbound.error && (() => {
                const { text, color } = translateStatus(inbound.status);
                return (
                    <div aria-live="polite" className="flex justify-between items-center text-sm">
                        <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航班狀態</span>
                        <span className={`font-black ${color}`}>{text}</span>
                    </div>
                );
             })()}
             {inbound && !inbound.error && inbound.delay && inbound.delay !== "null" && inbound.delay !== "0" && (
                <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> 延遲</span>
                    <span className="font-black text-red-500">{inbound.delay} 分鐘</span>
                </div>
             )}
          </div>
        </div>
      </div>
      
      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400 font-bold uppercase tracking-tighter">
         <Info className="w-3 h-3" /> TDX FIDS (TPE) · AviationStack (NRT)
      </div>

      {/* ── 去程建議出發時間計算器 ── */}
      <div className="mt-8 bg-gradient-to-r from-primary/5 to-blue-50 dark:from-primary/10 dark:to-slate-800 rounded-[2rem] p-6 md:p-8 border border-primary/10 dark:border-slate-700">
        <h3 className="text-lg md:text-xl font-black mb-4 flex items-center gap-3">
          <PlaneTakeoff className="w-5 h-5 text-primary" /> 去程 JX800 · 建議出發時間
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">✈️ 起飛時間</div>
            <div className="text-xl md:text-2xl font-black text-primary">08:30</div>
            <div className="text-xs text-gray-400">TPE 桃園機場</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">🏢 抵達機場</div>
            <div className="text-xl md:text-2xl font-black text-blue-500">06:30</div>
            <div className="text-xs text-gray-400">起飛前 2 小時</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">🚗 建議出家門</div>
            <div className="text-xl md:text-2xl font-black text-orange-500">05:30</div>
            <div className="text-xs text-gray-400">約 45-60 分鐘車程</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">☀️ 建議起床</div>
            <div className="text-xl md:text-2xl font-black text-amber-500">04:30</div>
            <div className="text-xs text-gray-400">整理行李、出發</div>
          </div>
        </div>

        {/* Timeline desktop */}
        <div className="hidden md:flex items-center justify-between gap-2 mb-4 text-sm">
          {[
            { time: "04:30", label: "起床", color: "bg-amber-500" },
            { time: "05:30", label: "出家門", color: "bg-orange-500" },
            { time: "06:30", label: "抵達機場", color: "bg-blue-500" },
            { time: "08:30", label: "起飛", color: "bg-primary" },
          ].map((step, i, arr) => (
            <React.Fragment key={step.time}>
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${step.color} mb-2`}></div>
                <div className="font-bold">{step.time}</div>
                <div className="text-xs text-gray-500">{step.label}</div>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 h-0.5 bg-gradient-to-r from-amber-500 via-orange-500 to-blue-500 mb-5"></div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Timeline mobile */}
        <div className="flex flex-col gap-2 mb-4 text-sm md:hidden">
          {[
            { time: "04:30", label: "起床", color: "bg-amber-500" },
            { time: "05:30", label: "出家門", color: "bg-orange-500" },
            { time: "06:30", label: "抵達機場", color: "bg-blue-500" },
            { time: "08:30", label: "起飛", color: "bg-primary" },
          ].map((step) => (
            <div key={step.time} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${step.color} shrink-0 mt-0.5`}></div>
              <div className="flex-1 flex items-center justify-between bg-gray-50 dark:bg-slate-900 rounded-xl px-3 py-2">
                <span className="font-bold">{step.time}</span>
                <span className="text-xs text-gray-500">{step.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-amber-700 dark:text-amber-400 mb-1">💡 建議</div>
              <p className="text-sm text-amber-600 dark:text-amber-300">
                去程為早班機，建議前一天晚上在 <strong>23:00 前就寢</strong>，並提早將行李整理完成。桃園機場报到截止為起飛前 <strong>45 分鐘</strong>，請預留充足時間。
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── 回程建議出發時間計算器 ── */}
      <div className="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-[2rem] p-6 md:p-8 border border-blue-100 dark:border-slate-700">
        <h3 className="text-lg md:text-xl font-black mb-4 flex items-center gap-3">
          <PlaneLanding className="w-5 h-5 text-accent" /> 回程 JX805 · 建議出發時間
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">✈️ 起飛時間</div>
            <div className="text-xl md:text-2xl font-black text-accent">20:40</div>
            <div className="text-xs text-gray-400">NRT 成田機場</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">🏢 抵達機場</div>
            <div className="text-xl md:text-2xl font-black text-blue-500">18:40</div>
            <div className="text-xs text-gray-400">起飛前 2 小時</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">🏨 從飯店出發</div>
            <div className="text-xl md:text-2xl font-black text-orange-500">~16:30</div>
            <div className="text-xs text-gray-400">JR 總武線 + NEX</div>
          </div>
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl text-center shadow-sm">
            <div className="text-xs text-gray-500 font-bold mb-1">🏠 最晚退房</div>
            <div className="text-xl md:text-2xl font-black text-green-500">14:00</div>
            <div className="text-xs text-gray-400">當天最晚</div>
          </div>
        </div>

        {/* Timeline desktop */}
        <div className="hidden md:flex items-center justify-between gap-2 mb-4 text-sm">
          {[
            { time: "14:00", label: "退房", color: "bg-orange-500" },
            { time: "16:30", label: "出發", color: "bg-yellow-500" },
            { time: "18:40", label: "抵達機場", color: "bg-green-500" },
            { time: "20:40", label: "起飛", color: "bg-accent" },
          ].map((step, i, arr) => (
            <React.Fragment key={step.time}>
              <div className="flex flex-col items-center">
                <div className={`w-3 h-3 rounded-full ${step.color} mb-2`}></div>
                <div className="font-bold">{step.time}</div>
                <div className="text-xs text-gray-500">{step.label}</div>
              </div>
              {i < arr.length - 1 && (
                <div className="flex-1 h-0.5 bg-gradient-to-r from-orange-500 via-yellow-500 to-green-500 mb-5"></div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* Timeline mobile */}
        <div className="flex flex-col gap-2 mb-4 text-sm md:hidden">
          {[
            { time: "14:00", label: "退房", color: "bg-orange-500" },
            { time: "16:30", label: "出發", color: "bg-yellow-500" },
            { time: "18:40", label: "抵達機場", color: "bg-green-500" },
            { time: "20:40", label: "起飛", color: "bg-accent" },
          ].map((step) => (
            <div key={step.time} className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${step.color} shrink-0 mt-0.5`}></div>
              <div className="flex-1 flex items-center justify-between bg-gray-50 dark:bg-slate-900 rounded-xl px-3 py-2">
                <span className="font-bold">{step.time}</span>
                <span className="text-xs text-gray-500">{step.label}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <div className="font-black text-amber-700 dark:text-amber-400 mb-1">💡 建議</div>
              <p className="text-sm text-amber-600 dark:text-amber-300">
                最後一天午餐建議提前到 <strong>11:30</strong>，留充足時間從飯店整理行李、寄放行李後前往機場。從錦糸町到成田機場約需 <strong>60-70 分鐘</strong>。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
