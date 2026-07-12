"use client";

import React, { useEffect, useState } from "react";
import { PlaneTakeoff, PlaneLanding, Clock, Calendar, Star, Info, Loader2, AlertTriangle, Plane } from "lucide-react";
import {
  TRIP_INBOUND_DATE,
  TRIP_OUTBOUND_DATE,
  isFlightSourceForDate,
} from "@/lib/trip-dates";

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
  // 機型資訊
  aircraftIcao?: string;
  aircraftModel?: string;
  aircraftTags?: string[];
  aircraftLive?: boolean;
  aircraftSource?: string;
  // 回程雙端航廈 / 航班資訊（NRT 出發 + TPE 抵達）
  depGate?: string;
  depTerminal?: string;
  depScheduled?: string;
  depEstimated?: string;
  depActual?: string;
  depDelay?: string;
  depStatus?: string;
  arrGate?: string;
  arrTerminal?: string;
  arrScheduled?: string;
  arrEstimated?: string;
  arrActual?: string;
  arrStatus?: string;
  depSource?: string;
  arrSource?: string;
  depSourceDate?: string | null;
  arrSourceDate?: string | null;
  source?: string;
  isLive?: boolean;
  sourceDate?: string | null;
};

type FlightResponse = {
  outbound: FlightData;
  inbound: FlightData;
  requestedDates?: { outbound: string; inbound: string };
  liveWindow?: { outbound: boolean; inbound: boolean };
};

/** 將上游正規化狀態翻譯為中文；未知值一律採中性色，避免取消班機顯示綠色。 */
function translateStatus(status: string): { text: string; color: string } {
  switch (status.trim().toLowerCase()) {
    case "scheduled": return { text: "已排定", color: "text-blue-500" };
    case "on-time":
    case "準時": return { text: "準時", color: "text-green-500" };
    case "active": return { text: "飛行中", color: "text-green-500" };
    case "departed": return { text: "已起飛", color: "text-green-500" };
    case "arrived": return { text: "已抵達", color: "text-green-500" };
    case "landed": return { text: "已降落", color: "text-green-500" };
    case "cancelled":
    case "canceled":
    case "取消": return { text: "已取消", color: "text-red-500" };
    case "delayed":
    case "延遲":
    case "延誤": return { text: "延遲", color: "text-red-500" };
    case "diverted": return { text: "改降", color: "text-orange-500" };
    default: return { text: "未知", color: "text-gray-500" };
  }
}

export function FlightInfo() {
  const [flightData, setFlightData] = useState<FlightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFlight() {
      try {
        const params = new URLSearchParams({
          flight: "JX800",
          date: TRIP_OUTBOUND_DATE,
          inboundDate: TRIP_INBOUND_DATE,
        });
        const res = await fetch(`/api/flight-info?${params.toString()}`);
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
  const outboundResponseMatches =
    flightData?.requestedDates?.outbound === TRIP_OUTBOUND_DATE;
  const inboundResponseMatches =
    flightData?.requestedDates?.inbound === TRIP_INBOUND_DATE;
  const outboundLive = Boolean(
    outboundResponseMatches &&
    outbound?.isLive &&
    isFlightSourceForDate(outbound.sourceDate, TRIP_OUTBOUND_DATE),
  );
  const inboundDepLive = Boolean(
    inboundResponseMatches &&
    inbound?.isLive &&
    inbound.depSource === "AviationStack" &&
    isFlightSourceForDate(inbound.depSourceDate, TRIP_INBOUND_DATE),
  );
  const inboundArrLive = Boolean(
    inboundResponseMatches &&
    inbound?.isLive &&
    inbound.arrSource === "TDX-Arrival" &&
    isFlightSourceForDate(inbound.arrSourceDate, TRIP_INBOUND_DATE),
  );
  const inboundLive = inboundDepLive || inboundArrLive;
  const outboundStatus = translateStatus(outbound?.status ?? "unknown");
  const outboundTerminal = outboundLive ? outbound?.terminal : "1";
  const inboundDepTerminal = inboundDepLive ? inbound?.depTerminal ?? "2" : "2";
  const inboundArrTerminal = inboundArrLive ? inbound?.arrTerminal ?? "1" : "1";
  const outboundAircraftTrusted = Boolean(
    outbound?.aircraftModel && (
      (outboundLive && outbound.source === "TDX-Departure") ||
      outbound.source === "hardcode-itinerary"
    ),
  );
  const inboundAircraftTrusted = Boolean(
    inbound?.aircraftModel && (
      (inboundArrLive && inbound.aircraftSource === "TDX-Arrival") ||
      inbound.aircraftSource === "hardcode-scheduled"
    ),
  );
  const liveSourceLabel = [
    outboundLive || inboundArrLive ? "TDX FIDS (TPE)" : null,
    inboundDepLive ? "AviationStack (NRT)" : null,
  ].filter(Boolean).join(" · ");

  return (
    <section id="flights" className="py-8 px-4 md:px-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      {fetchError && (
        <div role="alert" className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4 text-red-700 dark:text-red-400 font-bold text-center">
          ⚠️ {fetchError}
        </div>
      )}
      <div className="text-center mb-10">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">
          {outboundLive || inboundLive ? "Live Flight Status" : "Scheduled Flight Plan"}
        </div>
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
              <div className={`${outboundLive ? "bg-green-500/10 text-green-600 border-green-500/20" : "bg-gray-400/10 text-gray-500 border-gray-400/20"} px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border`}>
                <span className={`w-1.5 h-1.5 rounded-full ${outboundLive ? "bg-green-500 animate-pulse" : "bg-gray-400"}`}></span>
                {outboundLive ? "Live Status" : "預定航班"}
              </div>
              {loading ? (
                <div className="mt-2 flex items-center gap-1 text-sm text-gray-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> 正在讀取登機門...
                </div>
              ) : outboundLive && outbound ? (
                <div className="mt-2 text-right">
                  <span className="text-sm font-bold text-gray-400 block">登機門 / GATE</span>
                  <span className="text-3xl font-black text-primary leading-none">{outbound.gate}</span>
                </div>
              ) : (
                <div className="mt-2 text-right text-sm text-gray-400 italic">
                  <span className="block font-bold not-italic">登機門尚未公佈</span>
                  <span className="text-xs">出發當日自動更新</span>
                </div>
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
            {outbound && (
              <>
                <div aria-live="polite" className="flex justify-between items-center text-sm">
                  <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航班狀態</span>
                  <span className={`font-black ${outboundLive ? outboundStatus.color : "text-gray-500"}`}>
                    {outboundLive ? outboundStatus.text : "預定"}
                  </span>
                </div>
                {outboundTerminal && (
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 航廈</span>
                    <span className="font-black text-gray-700 dark:text-gray-200">第 {outboundTerminal} 航廈</span>
                  </div>
                )}
                {outboundAircraftTrusted && outbound.aircraftModel && (
                  <>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-bold flex items-center gap-2"><Plane className="w-3.5 h-3.5" /> 機型</span>
                      <span className="font-black text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                        {outbound.aircraftModel}
                        <span className="text-[10px] text-gray-400">({outbound.aircraftIcao})</span>
                        {outboundLive && outbound.aircraftLive
                          ? <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">LIVE</span>
                          : <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">預定</span>}
                      </span>
                    </div>
                    {outbound.aircraftTags && outbound.aircraftTags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {outbound.aircraftTags.map((t) => (
                          <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-full text-[11px] font-bold">{t}</span>
                        ))}
                      </div>
                    )}
                  </>
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
              ) : inbound ? (
                <>
                  {/* 抵達來源（TDX-Arrival = TPE 連線，hardcode = 預定） */}
                  {inboundLive ? (
                    <div className="bg-green-500/10 text-green-600 px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border border-green-500/20">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> LIVE
                    </div>
                  ) : (
                    <div className="bg-gray-400/10 text-gray-500 px-3 py-1 rounded-full text-sm font-black uppercase tracking-widest flex items-center gap-1.5 border border-gray-400/20">
                      <span className="w-1.5 h-1.5 bg-gray-400 rounded-full"></span> 預定
                    </div>
                  )}
                  <div className="mt-2 text-right text-xs text-gray-400 font-bold">
                    NRT 航廈 第 {inboundDepTerminal}　·　TPE 航廈 第 {inboundArrTerminal}
                  </div>
                </>
              ) : (
                <div className="text-sm text-gray-400 italic">航班資訊尚未公佈</div>
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
              <span className="text-gray-400 font-bold flex items-center gap-2"><Calendar className="w-3.5 h-3.5" /> 出發日期</span>
              <span className="font-black text-gray-700 dark:text-gray-200">2026 / 09 / 06 (日)</span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> 班機編號</span>
              <span className="font-black text-gray-700 dark:text-gray-200">JX 805</span>
            </div>

            {/* NRT 出發端航廈 */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> NRT 出發航廈</span>
              <span className="font-black text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                第 {inboundDepTerminal} 航廈
                {inboundDepLive && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full text-[10px] font-bold">LIVE</span>
                )}
                {!inboundDepLive && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">預定</span>
                )}
              </span>
            </div>

            {/* NRT 出發端登機門 */}
            {inboundDepLive && inbound?.depGate && inbound.depGate !== "尚未公佈" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> NRT 登機門</span>
                <span className="font-black text-gray-700 dark:text-gray-200">{inbound.depGate}</span>
              </div>
            )}

            {/* TPE 抵達端航廈 */}
            <div className="flex justify-between items-center text-sm">
              <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> TPE 抵達航廈</span>
              <span className="font-black text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                第 {inboundArrTerminal} 航廈
                {inboundArrLive && (
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full text-[10px] font-bold">LIVE</span>
                )}
                {!inboundArrLive && (
                  <span className="px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">預定</span>
                )}
              </span>
            </div>

            {/* TPE 抵達端登機門 */}
            {inboundArrLive && inbound?.arrGate && inbound.arrGate !== "尚未公佈" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> TPE 登機門</span>
                <span className="font-black text-gray-700 dark:text-gray-200">{inbound.arrGate}</span>
              </div>
            )}

            {/* 出發狀態（AviationStack） */}
            {inboundDepLive && inbound && inbound.depStatus && inbound.depStatus !== "unknown" && (() => {
              const { text, color } = translateStatus(inbound.depStatus);
              return (
                <div aria-live="polite" className="flex justify-between items-center text-sm">
                  <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 出發狀態</span>
                  <span className={`font-black ${color}`}>{text}</span>
                </div>
              );
            })()}

            {/* 抵達狀態（TDX） */}
            {inboundArrLive && inbound && inbound.arrStatus && inbound.arrStatus !== "unknown" && (() => {
              const { text, color } = translateStatus(inbound.arrStatus);
              return (
                <div aria-live="polite" className="flex justify-between items-center text-sm">
                  <span className="text-gray-400 font-bold flex items-center gap-2"><Info className="w-3.5 h-3.5" /> 抵達狀態</span>
                  <span className={`font-black ${color}`}>{text}</span>
                </div>
              );
            })()}

            {/* 誤點（出發端） */}
            {inboundDepLive && inbound && inbound.depDelay && inbound.depDelay !== "null" && inbound.depDelay !== "0" && (
              <div className="flex justify-between items-center text-sm">
                <span className="text-gray-400 font-bold flex items-center gap-2"><Clock className="w-3.5 h-3.5" /> 誤點</span>
                <span className="font-black text-red-500">{inbound.depDelay} 分鐘</span>
              </div>
            )}

            {/* 機型 */}
            {inboundAircraftTrusted && inbound && inbound.aircraftModel && (
              <>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-gray-400 font-bold flex items-center gap-2"><Plane className="w-3.5 h-3.5" /> 機型</span>
                  <span className="font-black text-gray-700 dark:text-gray-200 flex items-center gap-1.5">
                    {inbound.aircraftModel}
                    <span className="text-[10px] text-gray-400">({inbound.aircraftIcao})</span>
                    {inboundArrLive && inbound.aircraftLive ? (
                      <span className="ml-1 px-1.5 py-0.5 bg-green-100 text-green-600 rounded-full text-[10px] font-bold">LIVE</span>
                    ) : (
                      <span className="ml-1 px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full text-[10px] font-bold">預定</span>
                    )}
                  </span>
                </div>
                {inbound.aircraftTags && inbound.aircraftTags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {inbound.aircraftTags.map((t) => (
                      <span key={t} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300 rounded-full text-[11px] font-bold">{t}</span>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="mt-8 flex items-center justify-center gap-2 text-sm text-gray-400 font-bold uppercase tracking-tighter">
        <Info className="w-3 h-3" />
        {outboundLive || inboundLive
          ? liveSourceLabel
          : "目前顯示預定資訊 · 出發當日才啟用即時狀態"}
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
                去程為早班機，建議前一天晚上在 <strong>23:00 前就寢</strong>，並提早將行李整理完成。桃園機場報到截止為起飛前 <strong>45 分鐘</strong>，請預留充足時間。
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
            <div className="text-xs text-gray-500 font-bold mb-1">🏠 飯店退房</div>
            <div className="text-xl md:text-2xl font-black text-green-500">11:00</div>
            <div className="text-xs text-gray-400">標準退房時間</div>
          </div>
        </div>

        {/* Timeline desktop */}
        <div className="hidden md:flex items-center justify-between gap-2 mb-4 text-sm">
          {[
            { time: "11:00", label: "退房寄放", color: "bg-orange-500" },
            { time: "14:00", label: "取行李", color: "bg-amber-500" },
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
            { time: "11:00", label: "退房寄放", color: "bg-orange-500" },
            { time: "14:00", label: "取行李", color: "bg-amber-500" },
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
                請在 <strong>11:00</strong> 前完成退房並寄放行李，建議於 <strong>14:00</strong> 回飯店取件，再預留充足時間前往機場。從錦糸町搭 JR 總武快速到成田機場約需 <strong>85 分鐘</strong>，仍請依當日班次預留緩衝。
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
