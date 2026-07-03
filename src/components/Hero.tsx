"use client";

import { useEffect, useState } from "react";
import { differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";
import { MapPin, Calendar, Heart, ArrowDownCircle } from "lucide-react";

export function Hero() {
    const [timeLeft, setTimeLeft] = useState({
        days: 0, hours: 0, minutes: 0, seconds: 0, isDone: false,
    });

    useEffect(() => {
        const tripDate = new Date("2026-09-01T08:30:00+09:00");
        const tripEnd = new Date("2026-09-06T23:59:59+09:00");

        const timer = setInterval(() => {
            const now = new Date();
            if (now > tripEnd) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isDone: true });
                clearInterval(timer);
                return;
            }

            if (now > tripDate && now < tripEnd) {
                setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0, isDone: false });
            } else {
                const diffDays = differenceInDays(tripDate, now);
                const diffHours = differenceInHours(tripDate, now) % 24;
                const diffMinutes = differenceInMinutes(tripDate, now) % 60;
                const diffSeconds = differenceInSeconds(tripDate, now) % 60;

                setTimeLeft({
                    days: diffDays,
                    hours: diffHours,
                    minutes: diffMinutes,
                    seconds: diffSeconds,
                    isDone: false,
                });
            }
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <section id="hero" className="relative min-h-screen md:min-h-[85vh] flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-700">
            {/* Soft Ethereal Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100/50 dark:bg-primary/10 rounded-full blur-[120px] motion-safe:animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/50 dark:bg-indigo-600/10 rounded-full blur-[100px] motion-safe:animate-pulse" style={{ animationDelay: '2s' }}></div>
            </div>

            {/* Desktop: 三段水平排版 — 標題 | 倒數計時 | 資訊徽章 */}
            <div className="relative z-10 hidden md:block w-full max-w-7xl mx-auto px-8 py-12 animate-in fade-in duration-1000">
                {/* Tag — 置頂置中 */}
                <div className="flex justify-center mb-10 animate-in fade-in slide-in-from-top-2 duration-700">
                    <div className="inline-flex items-center gap-3 px-5 py-2 rounded-full bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-lg text-sm font-black uppercase tracking-[0.25em] text-primary">
                        <Heart className="w-4 h-4 fill-current motion-safe:animate-pulse" /> 愛的專屬旅程
                    </div>
                </div>

                {/* 三段水平排列 */}
                <div className="grid grid-cols-3 items-center gap-6 lg:gap-10">
                    {/* 左段 — 主標 */}
                    <div className="text-right pr-4 lg:pr-8 border-r border-slate-200/60 dark:border-white/10 animate-in fade-in slide-in-from-left-10 duration-1000">
                        <h1 className="font-serif font-black tracking-tighter leading-none text-slate-900 dark:text-white mb-3">
                            <span className="text-7xl lg:text-8xl block">東京</span>
                        </h1>
                        <span className="inline-flex items-center gap-2 mb-4">
                            <span className="h-px w-8 bg-primary"></span>
                            <span className="text-3xl lg:text-4xl font-black tracking-[0.15em] text-primary">自由行</span>
                        </span>
                        <p className="text-base lg:text-lg text-slate-500 dark:text-gray-400 font-medium tracking-tight leading-relaxed">
                            與毓寧愛的<br />
                            <span className="text-slate-900 dark:text-white font-black underline decoration-primary/30 decoration-2 underline-offset-4">六天五夜</span>東京旅行
                        </p>
                    </div>

                    {/* 中段 — 倒數計時 */}
                    <div className="flex justify-center animate-in fade-in zoom-in duration-1000 delay-200">
                        <div className="relative p-1 rounded-full bg-gradient-to-br from-white via-slate-100 to-slate-200 dark:from-white/10 dark:to-transparent shadow-[0_20px_50px_-15px_rgba(0,0,0,0.15)]">
                            <div className="bg-white/80 dark:bg-[#0c0c0e]/90 rounded-full px-6 py-6 lg:px-8 lg:py-7 backdrop-blur-2xl border border-white/50 dark:border-white/5 flex flex-col items-center">
                                <div className="text-xs font-black text-slate-400 dark:text-gray-500 uppercase tracking-[0.4em] mb-5 text-center">出發倒數</div>
                                {timeLeft.isDone ? (
                                    <div className="text-center py-2">
                                        <div className="text-4xl mb-1">🗼</div>
                                        <div className="text-lg font-black text-slate-800 dark:text-white">旅程已結束</div>
                                    </div>
                                ) : (
                                    <div className="flex items-end gap-3 lg:gap-4">
                                        {[
                                            { label: "天", value: timeLeft.days },
                                            { label: "時", value: timeLeft.hours },
                                            { label: "分", value: timeLeft.minutes },
                                            { label: "秒", value: timeLeft.seconds },
                                        ].map((item, idx) => (
                                            <div key={item.label} className="flex items-end">
                                                <div className="text-center">
                                                    <div className="text-4xl lg:text-5xl font-black tabular-nums text-slate-900 dark:text-white leading-none mb-1.5">
                                                        {String(item.value).padStart(2, '0')}
                                                    </div>
                                                    <div className="text-[10px] font-black text-primary uppercase tracking-widest">{item.label}</div>
                                                </div>
                                                {idx < 3 && <div className="text-3xl lg:text-4xl text-slate-300 dark:text-white/20 font-thin mx-1 -translate-y-2">:</div>}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* 右段 — 資訊徽章 */}
                    <div className="text-left pl-4 lg:pl-8 border-l border-slate-200/60 dark:border-white/10 space-y-3 animate-in fade-in slide-in-from-right-10 duration-1000 delay-300">
                        <div className="flex items-center gap-3 bg-white/70 dark:bg-white/5 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-sm border border-slate-100 dark:border-white/10">
                            <div className="bg-primary/10 p-2.5 rounded-xl text-primary shrink-0">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400 dark:text-gray-500 font-black uppercase tracking-widest">日期</div>
                                <div className="text-sm font-bold text-slate-700 dark:text-white">2026.09.01 - 09.06</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 bg-white/70 dark:bg-white/5 backdrop-blur-xl px-4 py-3 rounded-2xl shadow-sm border border-slate-100 dark:border-white/10">
                            <div className="bg-accent/10 p-2.5 rounded-xl text-accent shrink-0">
                                <MapPin className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-[10px] text-slate-400 dark:text-gray-500 font-black uppercase tracking-widest">地點</div>
                                <div className="text-sm font-bold text-slate-700 dark:text-white">日本, 東京</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Mobile: stacked, larger typography */}
            <div className="relative z-10 md:hidden w-full px-5 py-10 flex flex-col items-center justify-center min-h-[calc(100vh-4rem)]">
                {/* Tag */}
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/60 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow text-sm font-black uppercase tracking-[0.15em] text-primary mb-8 animate-in fade-in duration-700">
                    <Heart className="w-3.5 h-3.5 fill-current motion-safe:animate-pulse" /> 愛的專屬旅程
                </div>

                {/* Title — 統一寬度 */}
                <div className="text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 w-full max-w-md">
                    <div className="flex flex-col items-center gap-1 mb-6">
                        <span className="text-7xl sm:text-8xl font-serif font-black tracking-tighter leading-none text-slate-900 dark:text-white">東京</span>
                        <span className="flex items-center gap-2">
                            <span className="h-px w-6 bg-primary"></span>
                            <span className="text-3xl sm:text-4xl font-black tracking-[0.15em] text-primary">自由行</span>
                            <span className="h-px w-6 bg-primary"></span>
                        </span>
                    </div>
                    <p className="text-xl sm:text-2xl text-slate-500 dark:text-gray-400 font-medium leading-relaxed">
                        與毓寧愛的<br />
                        <span className="text-slate-900 dark:text-white font-black underline decoration-primary/30 decoration-3 underline-offset-6">六天五夜</span>東京旅行
                    </p>
                </div>

                {/* Info badges — 與標題同寬 */}
                <div className="flex gap-3 mb-8 w-full max-w-md animate-in fade-in duration-700 delay-200">
                    <div className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 px-4 py-3 rounded-xl shadow-sm">
                        <Calendar className="w-4 h-4 text-primary shrink-0" />
                        <span className="text-sm font-bold text-slate-700 dark:text-white">2026.09.01</span>
                    </div>
                    <div className="flex-1 flex items-center justify-center gap-2 bg-white dark:bg-slate-800 px-4 py-3 rounded-xl shadow-sm">
                        <MapPin className="w-4 h-4 text-accent shrink-0" />
                        <span className="text-sm font-bold text-slate-700 dark:text-white">日本東京</span>
                    </div>
                </div>

                {/* Countdown Card — 與上方區塊同寬，對齊對稱 */}
                <div className="w-full max-w-md animate-in fade-in zoom-in duration-700 delay-300">
                    <div className="bg-white/90 dark:bg-[#0c0c0e]/90 rounded-[2.5rem] p-6 backdrop-blur-2xl border border-white/50 dark:border-white/10 shadow-lg">
                        <div className="text-center text-xs font-black text-slate-400 uppercase tracking-[0.25em] mb-5">
                            出發倒數計時
                        </div>
                        {timeLeft.isDone ? (
                            <div className="text-center py-4">
                                <div className="text-4xl mb-2">🗼</div>
                                <div className="text-xl font-black text-slate-800 dark:text-white">旅程已圓滿結束</div>
                            </div>
                        ) : (
                            <div className="grid grid-cols-4 gap-2">
                                {[
                                    { label: "天", value: timeLeft.days },
                                    { label: "時", value: timeLeft.hours },
                                    { label: "分", value: timeLeft.minutes },
                                    { label: "秒", value: timeLeft.seconds },
                                ].map((item) => (
                                    <div key={item.label} className="text-center bg-gray-50 dark:bg-slate-800 rounded-2xl py-3">
                                        <div className="text-2xl sm:text-3xl font-black tabular-nums text-slate-900 dark:text-white leading-none">
                                            {String(item.value).padStart(2, '0')}
                                        </div>
                                        <div className="text-xs font-black text-primary uppercase tracking-widest mt-1">{item.label}</div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Scroll indicator */}
            <div
                role="button"
                tabIndex={0}
                aria-label="向下捲動"
                className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-20 cursor-pointer"
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { document.getElementById('flights')?.scrollIntoView({ behavior: 'smooth' }); } }}
            >
                <ArrowDownCircle className="w-5 h-5" />
            </div>
        </section>
    );
}
