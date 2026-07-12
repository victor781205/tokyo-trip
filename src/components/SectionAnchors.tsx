"use client";

/**
 * 複合 tab（行前準備 / 交通 / 助手 / 預算）頁內錨點列。
 * 點擊後平滑捲到對應 section id。
 */
export function SectionAnchors({
  items,
}: {
  items: { id: string; label: string; emoji?: string }[];
}) {
  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    // 預留頂部 nav + 本錨點列高度，避免區塊標題被 sticky 遮住
    const offset = 120;
    const y = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top: Math.max(0, y), behavior: "smooth" });
  };

  return (
    <div
      role="navigation"
      aria-label="本頁區塊"
      className="sticky top-[calc(4rem+var(--sat))] z-30 -mx-1 mb-4 sm:mb-6"
    >
      <div className="flex gap-2 overflow-x-auto scrollbar-hide px-1 py-2">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => jump(item.id)}
            className="min-h-11 shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white dark:bg-slate-800 border border-gray-100 dark:border-slate-700 shadow-sm text-xs sm:text-sm font-black text-gray-700 dark:text-gray-200 active:scale-95 hover:border-primary/40 hover:text-primary transition-all"
          >
            {item.emoji && <span aria-hidden>{item.emoji}</span>}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
