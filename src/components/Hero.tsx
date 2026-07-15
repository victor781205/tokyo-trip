"use client";

import { useCallback, useEffect, useState } from "react";
import { differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";
import { ArrowDown, ArrowRight, CalendarDays, Plane } from "lucide-react";
import { TRIP_END_AT, TRIP_START_AT, getTripTimelineState } from "@/lib/trip-dates";
import { TokyoMark } from "@/components/TokyoBrand";

const TRIP_DATE = new Date(TRIP_START_AT);
const TRIP_END = new Date(TRIP_END_AT);
const MS_PER_DAY = 1000 * 60 * 60 * 24;

type Phase = "pre" | "ongoing" | "done";
type TimerState = {
    phase: Phase;
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    // 旅程進行中用：目前已過第幾天（1-based）、距返程的剩餘時間
    currentDay?: number;
};
const STATE_ZERO: TimerState = { phase: "done", days: 0, hours: 0, minutes: 0, seconds: 0 };
const pad = (n: number, w = 2) => String(Math.max(0, n)).padStart(w, "0");

const padDays = (n: number) => n >= 100 ? String(n).padStart(3, "0") : String(Math.max(0, n)).padStart(2, "0");

export function Hero({ onNavigate, pushControls }: { onNavigate?: (tab: string) => void; pushControls?: React.ReactNode }) {
    const [timeLeft, setTimeLeft] = useState<TimerState>({
        phase: "pre", days: 0, hours: 0, minutes: 0, seconds: 0,
    });

    useEffect(() => {
        const tick = () => {
            const now = Date.now();
            const startMs = TRIP_DATE.getTime();
            const endMs = TRIP_END.getTime();

            if (now > endMs) {
                setTimeLeft({ ...STATE_ZERO, phase: "done" });
                return false;
            }

            if (now < startMs) {
                // 出發前：倒數到 TRIP_DATE
                const diff = startMs - now;
                setTimeLeft({
                    phase: "pre",
                    days: Math.floor(diff / MS_PER_DAY),
                    hours: differenceInHours(TRIP_DATE, now) % 24,
                    minutes: differenceInMinutes(TRIP_DATE, now) % 60,
                    seconds: differenceInSeconds(TRIP_DATE, now) % 60,
                });
                return true;
            }

            // 旅程進行中：顯示「第 N 天」與距返程的剩餘時間
            const diff = endMs - now;
            setTimeLeft({
                phase: "ongoing",
                currentDay: getTripTimelineState(new Date(now)).dayNumber,
                days: Math.floor(diff / MS_PER_DAY),
                hours: differenceInHours(TRIP_END, now) % 24,
                minutes: differenceInMinutes(TRIP_END, now) % 60,
                seconds: differenceInSeconds(TRIP_END, now) % 60,
            });
            return true;
        };

        // 首次立即執行，避免初始延遲一秒
        if (tick() === false) return;

        const timer = setInterval(() => {
            if (tick() === false) clearInterval(timer);
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const go = useCallback((tab: string) => () => {
        onNavigate?.(tab);
        // 體驗 fallback：直接 scroll 到內容區（防 onNavigate 沒傳）
        if (!onNavigate) document.getElementById("flights")?.scrollIntoView({ behavior: "smooth" });
    }, [onNavigate]);

    return (
        <section id="hero" className="trip-hero">
            <div className="trip-hero__grid" aria-hidden="true" />
            <div className="trip-hero__sun" aria-hidden="true" />
            <TokyoMark className="trip-hero__tower" aria-hidden="true" />
            <div className="trip-hero__kanji" aria-hidden="true">東京</div>

            <div className="trip-hero__canvas">
                <div className="trip-hero__topline">
                    <span className="font-metric">TOKYO PRIVATE JOURNEY · 2026</span>
                    <span className="trip-hero__edition">6 DAYS / 5 NIGHTS</span>
                </div>

                <div className="trip-hero__layout">
                    <div className="trip-hero__story">
                        <p className="trip-hero__eyebrow">與毓寧的東京旅行</p>
                        <h1>東京，<br /><em>一起出發。</em></h1>
                        <p className="trip-hero__lede">六天五夜，把航班、每日路線與想吃的店，收進同一份會同步的旅行手冊。</p>

                        <div className="trip-hero__route" aria-label="去程航班摘要">
                            <div>
                                <span>SEP 01 · TUE</span>
                                <strong className="font-metric">TPE</strong>
                                <small>08:30 · TAOYUAN</small>
                            </div>
                            <div className="trip-hero__route-line" aria-hidden="true">
                                <Plane />
                            </div>
                            <div className="text-right">
                                <span>JX800</span>
                                <strong className="font-metric">NRT</strong>
                                <small>12:55 · TOKYO</small>
                            </div>
                        </div>

                        <div className="trip-hero__actions">
                            <button type="button" onClick={go("itinerary")} className="trip-hero__primary-action">
                                查看六日行程 <ArrowRight />
                            </button>
                            <button type="button" aria-label="查看航班資訊" onClick={go("flights")} className="trip-hero__secondary-action focus-visible:ring-2 focus-visible:ring-primary">航班詳情</button>
                        </div>
                    </div>

                    <div className="trip-hero__countdown">
                        <div className="trip-hero__countdown-head">
                            <div>
                                <span>{timeLeft.phase === "ongoing" ? "JOURNEY IN PROGRESS" : timeLeft.phase === "done" ? "MEMORIES ARCHIVE" : "DEPARTURE COUNTDOWN"}</span>
                                <strong>{timeLeft.phase === "ongoing" ? `旅程第 ${timeLeft.currentDay ?? 1} 天` : timeLeft.phase === "done" ? "旅程圓滿完成" : "距離東京還有"}</strong>
                            </div>
                            <CalendarDays />
                        </div>

                        {timeLeft.phase === "done" ? (
                            <div className="trip-hero__done">
                                <TokyoMark />
                                <p>謝謝一起完成這趟東京旅程。</p>
                            </div>
                        ) : (
                            <div className="trip-hero__timer font-metric" aria-live="polite" aria-label={`${timeLeft.days} 天 ${timeLeft.hours} 小時 ${timeLeft.minutes} 分 ${timeLeft.seconds} 秒`}>
                                <div><strong>{padDays(timeLeft.days)}</strong><span>DAYS</span></div>
                                <div><strong>{pad(timeLeft.hours)}</strong><span>HOURS</span></div>
                                <div><strong>{pad(timeLeft.minutes)}</strong><span>MINUTES</span></div>
                                <div className="trip-hero__seconds"><strong>{pad(timeLeft.seconds)}</strong><span>SECONDS</span></div>
                            </div>
                        )}

                        <div className="trip-hero__ticket-foot">
                            <span>STARLUX JX800</span>
                            <span>A350-1000</span>
                            <span>2026.09.01</span>
                        </div>
                        {pushControls && <div className="trip-hero__push">{pushControls}</div>}
                    </div>
                </div>
            </div>

            <button type="button" aria-label="查看今日焦點" onClick={() => document.getElementById("today-focus")?.scrollIntoView({ behavior: "smooth" })} className="trip-hero__scroll">
                <span>SCROLL</span><ArrowDown />
            </button>
        </section>
    );
}
