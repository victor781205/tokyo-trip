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
        <section id="hero" className="relative min-h-[60svh] md:min-h-[80svh] flex items-center justify-center overflow-hidden bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-white transition-colors duration-700">
            {/* Soft Ethereal Background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-red-100/50 dark:bg-primary/10 rounded-full blur-[120px] animate-pulse"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-blue-100/50 dark:bg-indigo-600/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }}></div>
                {/* Subtle Paper Texture (CSS-only) */}
                <div className="absolute inset-0 opacity-[0.15] mix-blend-multiply dark:mix-blend-overlay pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.03) 2px, rgba(0,0,0,0.03) 4px), repeating-linear-gradient(90deg, transparent, transparent 2px, rgba(0,0,0,0.02) 2px, rgba(0,0,0,0.02) 4px)' }}></div>
            </div>

            <div className="relative z-10 w-full max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center">

                {/* Left Side: Editorial Typography */}
                <div className="space-y-8 text-left animate-in fade-in slide-in-from-left-10 duration-1000">
                    <div className="inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-lg text-xl md:text-2xl font-black uppercase tracking-[0.2em] text-primary">
                        <Heart className="w-6 h-6 fill-current animate-pulse" /> 愛的專屬旅程
                    </div>

                    <div className="space-y-6">
                        <h1 className="flex flex-col gap-2">
                            <span className="text-8xl md:text-[12rem] font-serif font-black tracking-tighter leading-none text-slate-900 dark:text-white drop-shadow-sm">
                                東京
                            </span>
                            <span className="text-4xl md:text-6xl font-sans font-black tracking-[0.2em] text-primary flex items-center gap-4 ml-2">
                                <span className="h-px w-12 bg-primary hidden md:block"></span>
                                自由行
                            </span>
                        </h1>
                        <p className="text-2xl md:text-3xl text-slate-500 dark:text-gray-400 font-medium tracking-tight mt-4">
                            與毓寧愛的<br />
                            <span className="text-slate-900 dark:text-white font-black underline decoration-primary/30 decoration-4 underline-offset-8">六天五夜</span>東京旅行
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-6 pt-4">
                        <div className="flex items-center gap-4 group">
                            <div className="bg-primary/5 p-3 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                <Calendar className="w-6 h-6 text-primary" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-400 dark:text-gray-500 font-black uppercase tracking-widest">日期</div>
                                <div className="text-base font-bold text-slate-700 dark:text-white">2026.09.01 - 09.06</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 group">
                            <div className="bg-accent/5 p-3 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                                <MapPin className="w-6 h-6 text-accent" />
                            </div>
                            <div>
                                <div className="text-sm text-slate-400 dark:text-gray-500 font-black uppercase tracking-widest">地點</div>
                                <div className="text-base font-bold text-slate-700 dark:text-white">日本, 東京</div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Airy Countdown Card */}
                <div className="relative flex justify-center lg:justify-end animate-in fade-in zoom-in duration-1000 delay-300">
                    <div className="relative p-1 rounded-[4rem] bg-gradient-to-br from-white via-slate-100 to-slate-200 dark:from-white/10 dark:to-transparent shadow-[0_50px_100px_-20px_rgba(0,0,0,0.1)] dark:shadow-none">
                        <div className="bg-white/80 dark:bg-[#0c0c0e]/90 rounded-[3.9rem] p-10 md:p-14 backdrop-blur-2xl border border-white/50 dark:border-white/5 flex flex-col items-center">
                            <div className="text-base sm:text-base md:text-lg font-black text-slate-400 dark:text-gray-500 uppercase tracking-[0.4em] mb-12 text-center">出發倒數計時</div>

                            {timeLeft.isDone ? (
                                <div className="py-10 text-center">
                                    <div className="text-6xl mb-4">🗼</div>
                                    <div className="text-3xl font-black text-slate-800 dark:text-white">旅程已圓滿結束</div>
                                </div>
                            ) : (
                                <div className="grid grid-cols-4 gap-x-6 sm:gap-x-8 md:gap-x-10">
                                    {[
                                        { label: "天", value: timeLeft.days },
                                        { label: "時", value: timeLeft.hours },
                                        { label: "分", value: timeLeft.minutes },
                                        { label: "秒", value: timeLeft.seconds },
                                    ].map((item) => (
                                        <div key={item.label} className="text-center">
                                            <div className="text-3xl sm:text-4xl md:text-5xl font-black tabular-nums text-slate-900 dark:text-white mb-2">
                                                {String(item.value).padStart(2, '0')}
                                            </div>
                                            <div className="text-base sm:text-lg md:text-xl font-black text-primary uppercase tracking-widest">{item.label}</div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 opacity-20">
                <ArrowDownCircle className="w-5 h-5" />
            </div>
        </section>
    );
}
