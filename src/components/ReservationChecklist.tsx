"use client";

import { Bell, CalendarCheck2, Check, Clock3, ExternalLink, Loader2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useTripState, type PackingItem } from "@/hooks/useTripState";

type ReservationTask = {
  id: string;
  title: string;
  detail: string;
  deadlineAt: string;
  deadlineLabel: string;
  officialUrl?: string;
  officialLabel?: string;
};

export const RESERVATION_TASKS: ReservationTask[] = [
  {
    id: "reservation:shibuya-sky",
    title: "SHIBUYA SKY 指定時段門票",
    detail: "Day 2 下午；官網目前僅販售兩週內日期，約 8/19 起確認 9/2 場次並挑選合適時段。",
    deadlineAt: "2026-08-19T10:00:00+09:00",
    deadlineLabel: "約 8/19 起確認（依官方實際開放）",
    officialUrl: "https://www.shibuya-scramble-square.com/sky/ticket/",
    officialLabel: "官方購票",
  },
  {
    id: "reservation:teamlab-planets",
    title: "teamLab Planets 指定時段門票",
    detail: "Day 4 16:30 前後，購票後確認 QR Ticket 與同行者分票。",
    deadlineAt: "2026-08-04T20:00:00+09:00",
    deadlineLabel: "建議 8/4 前完成",
    officialUrl: "https://teamlabplanets.dmm.com/en",
    officialLabel: "官方票券",
  },
  {
    id: "reservation:ghibli-museum",
    title: "吉卜力美術館 9 月門票",
    detail: "完全預約制、現場不售票；購票前先核對 9/5 是否開館。",
    deadlineAt: "2026-08-10T10:00:00+09:00",
    deadlineLabel: "8/10 10:00（日本）開賣",
    officialUrl: "https://www.ghibli-museum.jp/en/tickets/",
    officialLabel: "官方售票說明",
  },
  {
    id: "reservation:outbound-checkin",
    title: "JX800 去程線上報到",
    detail: "星宇非美國線通常於起飛前 48～1 小時開放；完成後保存登機證。",
    deadlineAt: "2026-08-30T08:30:00+08:00",
    deadlineLabel: "8/30 08:30 起可確認",
    officialUrl: "https://www.starlux-airlines.com/zh-TW/check-in-fly/check-in-now/online-check-in",
    officialLabel: "星宇線上報到",
  },
  {
    id: "reservation:return-checkin",
    title: "JX805 回程線上報到",
    detail: "回程由成田出發，開放後完成報到並再次確認航廈與行李規定。",
    deadlineAt: "2026-09-04T20:40:00+09:00",
    deadlineLabel: "9/4 20:40 起可確認",
    officialUrl: "https://www.starlux-airlines.com/zh-TW/check-in-fly/check-in-now/online-check-in",
    officialLabel: "星宇線上報到",
  },
  {
    id: "reservation:hotel-confirmation",
    title: "飯店訂房與入住資料確認",
    detail: "核對旅客姓名、入住 9/1、退房 9/6、付款方式與訂房確認信。",
    deadlineAt: "2026-08-25T20:00:00+09:00",
    deadlineLabel: "建議 8/25 前確認",
    officialUrl: "https://tc.tobuhotel.co.jp/levant/",
    officialLabel: "飯店官網",
  },
  {
    id: "reservation:restaurant-confirmations",
    title: "熱門餐廳預約整理",
    detail: "逐一核對日期、時間、人數與取消規則；資料留在訂位平台，不上傳證件。",
    deadlineAt: "2026-08-25T20:00:00+09:00",
    deadlineLabel: "建議 8/25 前確認",
  },
];

function toPackingItem(task: ReservationTask, packed = false): PackingItem {
  return { id: task.id, name: task.title, packed, category: "預約與門票" };
}

function toIcsDate(value: string) {
  return new Date(value).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeIcs(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function downloadReminder(task: ReservationTask) {
  const start = new Date(task.deadlineAt);
  const end = new Date(start.getTime() + 30 * 60_000);
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Tokyo Trip//Reservation Reminder//ZH-TW",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${task.id}@tokyo-trip`,
    `DTSTAMP:${toIcsDate(new Date().toISOString())}`,
    `DTSTART:${toIcsDate(start.toISOString())}`,
    `DTEND:${toIcsDate(end.toISOString())}`,
    `SUMMARY:${escapeIcs(task.title)}`,
    `DESCRIPTION:${escapeIcs(task.detail)}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT1H",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeIcs(task.title)}`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${task.id.replace(/[^a-z0-9-]/gi, "-")}.ics`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function ReservationChecklist() {
  const { isLoaded, packingList, updatePackingList } = useTripState();
  const [now] = useState(() => Date.now());
  const taskState = useMemo(
    () => new Map((packingList ?? []).filter((item) => item.id.startsWith("reservation:")).map((item) => [item.id, item.packed])),
    [packingList],
  );
  const completed = RESERVATION_TASKS.filter((task) => taskState.get(task.id)).length;

  const toggleTask = (task: ReservationTask) => {
    updatePackingList((prev) => {
      const existing = prev.find((item) => item.id === task.id);
      if (!existing) return [...prev, toPackingItem(task, true)];
      return prev.map((item) => item.id === task.id ? { ...item, packed: !item.packed } : item);
    });
  };

  const addAllTasks = () => {
    updatePackingList((prev) => {
      const existingIds = new Set(prev.map((item) => item.id));
      return [...prev, ...RESERVATION_TASKS.filter((task) => !existingIds.has(task.id)).map((task) => toPackingItem(task))];
    });
  };

  if (!isLoaded) {
    return (
      <section id="reservations" className="py-4 md:py-12 scroll-mt-28">
        <div className="rounded-3xl bg-white dark:bg-slate-800 p-6 shadow-xl" aria-label="同步預約清單中">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      </section>
    );
  }

  return (
    <section id="reservations" className="py-4 md:py-12 scroll-mt-28">
      <div className="rounded-[2rem] border border-gray-100 bg-white p-5 shadow-xl dark:border-slate-700 dark:bg-slate-800 md:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="inline-flex rounded-full bg-violet-100 px-3 py-1 text-xs font-black uppercase tracking-widest text-violet-800 dark:bg-violet-900/30 dark:text-violet-200">Reservations</div>
            <h2 className="mt-3 text-2xl font-black md:text-3xl">🎫 預約與門票待辦</h2>
            <p className="mt-1 text-sm font-bold text-gray-600 dark:text-gray-300">已完成 {completed} / {RESERVATION_TASKS.length}；勾選狀態會與同行裝置同步。</p>
          </div>
          <button type="button" onClick={addAllTasks} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-violet-200 bg-violet-50 px-4 text-sm font-black text-violet-800 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
            <Plus className="w-4 h-4" /> 加入行前清單
          </button>
        </div>

        <div className="mt-6 h-3 overflow-hidden rounded-full bg-gray-100 dark:bg-slate-900" role="progressbar" aria-valuemin={0} aria-valuemax={RESERVATION_TASKS.length} aria-valuenow={completed} aria-label="預約待辦進度">
          <div className="h-full rounded-full bg-violet-600 transition-[width]" style={{ width: `${(completed / RESERVATION_TASKS.length) * 100}%` }} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
          {RESERVATION_TASKS.map((task) => {
            const done = Boolean(taskState.get(task.id));
            const overdue = !done && now > new Date(task.deadlineAt).getTime();
            return (
              <article key={task.id} className={`rounded-2xl border p-4 ${done ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/10" : overdue ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-900/10" : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900"}`}>
                <div className="flex items-start gap-3">
                  <button type="button" onClick={() => toggleTask(task)} aria-label={done ? `標記「${task.title}」為未完成` : `標記「${task.title}」為完成`} aria-pressed={done} className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border-2 ${done ? "border-emerald-700 bg-emerald-700 text-white" : "border-gray-300 bg-white text-transparent dark:border-slate-600 dark:bg-slate-800"}`}>
                    <Check className="w-5 h-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    <h3 className={`font-black ${done ? "text-emerald-900 line-through dark:text-emerald-200" : "text-gray-900 dark:text-white"}`}>{task.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-gray-700 dark:text-gray-200">{task.detail}</p>
                    <div className={`mt-2 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-black ${done ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" : overdue ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" : "bg-amber-100 text-amber-900 dark:bg-amber-900/30 dark:text-amber-200"}`}>
                      {done ? <CalendarCheck2 className="w-3.5 h-3.5" /> : <Clock3 className="w-3.5 h-3.5" />}
                      {done ? "已完成" : overdue ? `已到期 · ${task.deadlineLabel}` : task.deadlineLabel}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 pl-14">
                  {task.officialUrl && (
                    <a href={task.officialUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3 text-xs font-black text-gray-800 dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100">
                      <ExternalLink className="w-4 h-4" /> {task.officialLabel}
                    </a>
                  )}
                  <button type="button" onClick={() => downloadReminder(task)} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 text-xs font-black text-violet-800 dark:border-violet-800 dark:bg-violet-900/20 dark:text-violet-200">
                    <Bell className="w-4 h-4" /> 加到行事曆
                  </button>
                </div>
              </article>
            );
          })}
        </div>
        <p className="mt-5 text-xs font-bold leading-relaxed text-gray-600 dark:text-gray-300">只同步完成狀態，不會上傳護照、票券 QR Code、訂位代號或其他敏感文件。官方規則與入場時段仍以各服務最新公告為準。</p>
      </div>
    </section>
  );
}
