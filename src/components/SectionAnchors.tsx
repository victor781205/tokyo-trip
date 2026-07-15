"use client";

import { ArrowUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * 複合 tab（行前準備 / 交通 / 助手 / 預算）頁內錨點列。
 * 點擊後平滑捲到對應 section id。
 */
export function SectionAnchors({
  items,
}: {
  items: { id: string; label: string; emoji?: string }[];
}) {
  const [activeId, setActiveId] = useState(items[0]?.id ?? "");
  const [showBackToTop, setShowBackToTop] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);
  const itemIds = items.map((item) => item.id).join("|");

  useEffect(() => {
    const ids = itemIds.split("|").filter(Boolean);
    const resetFrame = window.requestAnimationFrame(() => setActiveId(ids[0] ?? ""));

    const updateScrollState = () => setShowBackToTop(window.scrollY > 480);
    updateScrollState();
    window.addEventListener("scroll", updateScrollState, { passive: true });

    const sections = ids
      .map((id) => document.getElementById(id))
      .filter((section): section is HTMLElement => Boolean(section));
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActiveId(visible[0].target.id);
      },
      { rootMargin: "-128px 0px -60% 0px", threshold: [0, 0.1] },
    );
    sections.forEach((section) => observer.observe(section));

    return () => {
      window.cancelAnimationFrame(resetFrame);
      window.removeEventListener("scroll", updateScrollState);
      observer.disconnect();
    };
  }, [itemIds]);

  useEffect(() => {
    const activeButton = railRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    if (!activeButton || typeof activeButton.scrollIntoView !== "function") return;
    activeButton.scrollIntoView({
      behavior: typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "nearest",
      inline: "center",
    });
  }, [activeId]);

  const scrollBehavior = (): ScrollBehavior => (
    typeof window.matchMedia === "function"
      && window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "auto"
      : "smooth"
  );

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 預留頂部 nav + 本錨點列高度，避免區塊標題被 sticky 遮住
    const offset = 120;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: scrollBehavior() });
    setActiveId(id);
  };

  const backToTop = () => {
    window.scrollTo({ top: 0, behavior: scrollBehavior() });
    setActiveId(items[0]?.id ?? "");
  };

  return (
    <div
      role="navigation"
      aria-label="本頁區塊"
      className="sticky top-[calc(4rem+var(--sat))] z-30 -mx-1 mb-4 sm:mb-6 rounded-2xl border border-gray-100/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 shadow-sm backdrop-blur-xl"
    >
      <div className="flex items-center gap-1 px-2 py-2">
        <div ref={railRef} className="flex min-w-0 flex-1 gap-2 overflow-x-auto scrollbar-hide">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => jump(item.id)}
              aria-current={activeId === item.id ? "location" : undefined}
              data-active={activeId === item.id}
              className={`min-h-11 shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border text-xs sm:text-sm font-black active:scale-95 transition-colors ${activeId === item.id
                ? "bg-primary text-white border-primary shadow-sm"
                : "bg-white dark:bg-slate-800 border-gray-200 dark:border-slate-700 text-gray-700 dark:text-gray-200 hover:border-primary/40 hover:text-primary"
                }`}
            >
              {item.emoji && <span aria-hidden>{item.emoji}</span>}
              {item.label}
            </button>
          ))}
        </div>
        {showBackToTop && (
          <button
            type="button"
            onClick={backToTop}
            aria-label="返回本頁頂部"
            title="返回頂部"
            className="min-w-11 min-h-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:border-primary/40 hover:text-primary transition-colors"
          >
            <ArrowUp aria-hidden="true" className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}
