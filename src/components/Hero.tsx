"use client";

import { useEffect, useState } from "react";
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";
import { Heart, ArrowDownCircle, CalendarDays, Compass, Utensils, Train } from "lucide-react";

const TRIP_DATE = new Date("2026-09-01T08:30:00+09:00");
const TRIP_END = new Date("2026-09-06T23:59:59+09:00");
const TOTAL_TRIP_DAYS = 6;

export function Hero({ onNavigate }: { onNavigate?: (tab: string) => void }) {
    const [timeLeft, setTimeLeft] = useState({
        days: 0, hours: 0, minutes: 0, seconds: 0, isDone: false,
    });

    useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            if (now > TRIP_END) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isDone: true });
                clearInterval(timer);
                return;
            }

            if (now > TRIP_DATE && now < TRIP_END) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isDone: false });
            } else {
                setTimeLeft({
                    days: differenceInDays(TRIP_DATE, now),
                    hours: differenceInHours(TRIP_DATE, now) % 24,
                    minutes: differenceInMinutes(TRIP_DATE, now) % 60,
                    seconds: differenceInSeconds(TRIP_DATE, now) % 60,
                    isDone: false,
                });
            }
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const quickNavItems = [
        { id: "itinerary", label: "行程", icon: CalendarDays },
        { id: "transport", label: "交通", icon: Train },
        { id: "food", label: "美食", icon: Utensils },
        { id: "assistant", label: "助手", icon: Compass },
    ];

    const go = (tab: string) => () => {
        onNavigate?.(tab);
        // 體驗 fallback：直接 scroll 到內容區（防 onNavigate 沒傳）
        if (!onNavigate) document.getElementById("flights")?.scrollIntoView({ behavior: "smooth" });
    };

    return (
        <section
            id="hero"
            className="relative min-h-screen md:min-h-[88vh] flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-700"
        >
            {/* Soft Ethereal Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100/50 dark:bg-primary/10 rounded-full blur-[120px] motion-safe:animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/50 dark:bg-indigo-600/10 rounded-full blur-[100px] motion-safe:animate-pulse" style={{ animationDelay: "2s" }}></div>
                <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[40%] h-[40%] bg-amber-100/30 dark:bg-amber-500/5 rounded-full blur-[160px] motion-safe:animate-pulse" style={{ animationDelay: "4s" }}></div>
            </div>

            <div
                role="presentation"
                className="relative z-10 w-full max-w-3xl mx-auto px-6 py-12 flex flex-col items-center text-center animate-in fade-in duration-1000"
            >
                {/* 頂部 tag */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/70 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow text-xs md:text-sm font-black uppercase tracking-[0.25em] text-primary mb-6 animate-in fade-in slide-in-from-top-2 duration-700">
                    <Heart className="w-3.5 h-3.5 fill-current motion-safe:animate-pulse" /> 愛的專屬旅程
                </div>

                {/* 上方細標題 */}
                <div className="mb-8 animate-in fade-in slide-in-from-bottom-2 duration-700 delay-100">
                    <h1 className="text-2xl md:text-3xl font-serif font-black tracking-[0.25em] text-slate-900 dark:text-white mb-2">
                        TOKYO <span className="text-primary">6D5N</span>
                    </h1>
                    <p className="text-sm md:text-base text-slate-500 dark:text-gray-400 font-medium tracking-tight">
                        與毓寧愛的
                        <span className="text-slate-900 dark:text-white font-black underline decoration-primary/40 decoration-2 underline-offset-4 mx-1">六天五夜</span>
                        東京旅行
                    </p>
                </div>

                {/* 中央倒數 — 視覺主角 */}
                <div className="w-full max-w-2xl mb-8 animate-in fade-in zoom-in duration-1000 delay-200">
                    {timeLeft.isDone ? (
                        <div className="rounded-[2rem] bg-white/80 dark:bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-xl px-8 py-10 md:py-12">
                            <div className="text-6xl md:text-7xl mb-4">🗼</div>
                            <div className="text-xl md:text-2xl font-black text-slate-800 dark:text-white">旅程已圓滿結束</div>
                            <div className="text-sm text-slate-500 dark:text-gray-400 font-medium mt-2">感謝陪伴這趟愛的旅程</div>
                        </div>
                    ) : (
                        <div className="relative rounded-[2.5rem] bg-white/80 dark:bg-[#0c0c0e]/80 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-[0_20px_60px_-15px_rgba(0,0,0,0.15)] px-4 py-8 md:px-10 md:py-12">
                            {/* 上方 label */}
                            <div className="text-[10px] md:text-xs font-black text-slate-400 dark:text-gray-500 uppercase tracking-[0.4em] mb-5">
                                出發倒數時間
                            </div>

                            {/* 數字 row */}
                            <div className="flex items-center justify-center gap-2 md:gap-4 font-black tabular-nums text-slate-900 dark:text-white leading-none">
                                {/* 天 */}
                                <div className="flex flex-col items-center">
                                    <span className="text-6xl md:text-8xl bg-gradient-to-b from-slate-900 to-slate-600 dark:from-white dark:to-white/60 bg-clip-text text-transparent">
                                        {String(timeLeft.days).padStart(3, "0")}
                                    </span>
                                    <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest mt-2">DAYS</span>
                                </div>
                                <span className="text-5xl md:text-7xl text-primary/40 font-thin -translate-y-2 md:-translate-y-3">:</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-5xl md:text-7xl">{String(timeLeft.hours).padStart(2, "0")}</span>
                                    <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest mt-2">HRS</span>
                                </div>
                                <span className="text-5xl md:text-7xl text-primary/40 font-thin -translate-y-2 md:-translate-y-3">:</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-5xl md:text-7xl">{String(timeLeft.minutes).padStart(2, "0")}</span>
                                    <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest mt-2">MIN</span>
                                </div>
                                <span className="text-5xl md:text-7xl text-primary/40 font-thin -translate-y-2 md:-translate-y-3">:</span>
                                <div className="flex flex-col items-center">
                                    <span className="text-5xl md:text-7xl tabular-nums motion-safe:animate-pulse">
                                        {String(timeLeft.seconds).padStart(2, "0")}
                                    </span>
                                    <span className="text-[10px] md:text-xs font-black text-primary uppercase tracking-widest mt-2">SEC</span>
                                </div>
                            </div>

                            {/* 進度條 */}
                            {(() => {
                                const elapsedDays = TOTAL_TRIP_DAYS - Math.min(timeLeft.days, TOTAL_TRIP_DAYS);
                                const pct = Math.min(100, Math.max((elapsedDays / TOTAL_TRIP_DAYS) * 100, 5));
                                return (
                                    <div className="mt-7 max-w-md mx-auto">
                                        <div className="h-1 bg-slate-200/80 dark:bg-white/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-primary/60 to-primary rounded-full transition-all duration-500"
                                                style={{ width: `${pct}%` }}
                                            ></div>
                                        </div>
                                        <div className="text-[10px] text-slate-400 dark:text-gray-500 font-bold mt-2 tracking-wider uppercase">
                                            距出發 {timeLeft.days > 0 ? `尚有 ${timeLeft.days} 天` : "即將啟程"}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )}
                </div>

                {/* 底部資訊條 + 快速跳轉 */}
                <div className="w-full max-w-2xl animate-in fade-in slide-in-from-bottom-3 duration-700 delay-300">
                    {/* 日期 / 地點 一行小字 */}
                    <div className="flex items-center justify-center gap-3 text-xs md:text-sm text-slate-500 dark:text-gray-400 font-bold mb-5">
                        <span className="flex items-center gap-1.5">
                            <CalendarDays className="w-3.5 h-3.5 text-primary" />
                            2026.09.01 - 09.06
                        </span>
                        <span className="text-slate-300 dark:text-white/20">•</span>
                        <span>日本, 東京</span>
                    </div>

                    {/* 快速跳轉 chips */}
                    <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3">
                        {quickNavItems.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                type="button"
                                onClick={go(id)}
                                className="group inline-flex items-center gap-2 px-4 md:px-5 py-2 md:py-2.5 rounded-full bg-white/70 dark:bg-white/5 backdrop-blur border border-slate-200 dark:border-white/10 hover:border-primary hover:bg-primary/5 dark:hover:bg-primary/10 hover:text-primary shadow-sm transition-all active:scale-95"
                            >
                                <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 shrink-0" />
                                <span className="text-xs md:text-sm font-black tracking-wider">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <button
                type="button"
                aria-label="向下捲動"
                onClick={go("flights")}
                className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-30 hover:opacity-60 motion-safe:animate-bounce cursor-pointer transition-opacity"
            >
                <ArrowDownCircle className="w-6 h-6" />
            </button>
        </section>
    );
}
