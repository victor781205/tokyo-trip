"use client";

import { useState } from "react";
import { Plus, X, Check, ChevronDown, ChevronRight, Sparkles, RotateCcw, Download } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import {
  DEFAULT_PACKING_CATEGORIES,
  defaultPackingItemId,
} from "@/lib/packing-defaults";
import { generateShortId } from "@/lib/secure-id";

export interface PackingItem {
  id: string;
  name: string;
  packed: boolean;
  category: string;
}

export const DEFAULT_CATEGORIES = DEFAULT_PACKING_CATEGORIES;

function isReservationItem(item: PackingItem) {
  return item.id.startsWith("reservation:");
}

export function createDefaultPackingItems(): PackingItem[] {
  return Object.entries(DEFAULT_CATEGORIES).flatMap(([category, data]) =>
    data.items.map((name) => ({
      id: defaultPackingItemId(category, name),
      name,
      packed: false,
      category,
    })),
  );
}

export function PackingList() {
  const { isLoaded, packingList, updatePackingList } = useTripState();
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("其他");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(Object.keys(DEFAULT_CATEGORIES)));
  const syncedList: PackingItem[] = isLoaded ? packingList : [];
  // Reservation tasks share the synchronized storage slice, but they are not
  // physical luggage and must never affect this checklist's progress or actions.
  const currentList = syncedList.filter((item) => !isReservationItem(item));

  const categories = Array.from(new Set(currentList.map(i => i.category)));
  const missingDefaultItems = Object.entries(DEFAULT_CATEGORIES).flatMap(([category, data]) =>
    data.items.filter((name) => !currentList.some((item) => item.category === category && item.name === name)),
  );
  const totalItems = currentList.length;
  const packedItems = currentList.filter(i => i.packed).length;
  const progress = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;

  const togglePacked = (id: string) => {
    updatePackingList((prev) => prev.map((item) =>
      item.id === id && !isReservationItem(item)
        ? { ...item, packed: !item.packed }
        : item,
    ));
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    const item = { id: generateShortId(), name: newItemName.trim(), packed: false, category: newItemCategory };
    updatePackingList((prev) => [...prev, item]);
    setNewItemName("");
    setShowAdd(false);
  };

  const removeItem = (id: string) => {
    updatePackingList((prev) => prev.filter((item) => item.id !== id || isReservationItem(item)));
  };

  const restoreDefaults = () => {
    updatePackingList((prev) => {
      const missing = createDefaultPackingItems().filter(
        (suggested) => !prev.some((item) => item.category === suggested.category && item.name === suggested.name),
      );
      return missing.length > 0 ? [...prev, ...missing] : prev;
    });
    setExpandedCats((prev) => new Set([...prev, ...Object.keys(DEFAULT_CATEGORIES)]));
  };

  /** 一鍵取消全部勾選（重打包） */
  const uncheckAll = () => {
    if (packedItems === 0) return;
    updatePackingList((prev) => prev.map((item) =>
      isReservationItem(item) ? item : { ...item, packed: false },
    ));
  };

  /** 匯出成純文字（方便貼到 LINE / 備忘錄） */
  const exportAsText = async () => {
    const lines: string[] = ["🧳 行李清單", `進度 ${packedItems}/${totalItems}`, ""];
    for (const cat of categories) {
      const items = currentList.filter((i) => i.category === cat);
      lines.push(`【${getCategoryIcon(cat)} ${cat}】`);
      for (const item of items) {
        lines.push(`${item.packed ? "☑" : "☐"} ${item.name}`);
      }
      lines.push("");
    }
    const text = lines.join("\n").trim() + "\n";
    try {
      await navigator.clipboard.writeText(text);
      // 同時提供下載備份
    } catch {
      // ignore clipboard failure
    }
    try {
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `packing-list-${new Date().toISOString().slice(0, 10)}.txt`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // ignore download failure
    }
  };

  const toggleCategory = (cat: string) => {
    setExpandedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const getCategoryIcon = (cat: string) => {
    return DEFAULT_CATEGORIES[cat]?.icon || "📦";
  };

  if (!isLoaded) {
    return (
      <section className="py-6 md:py-20">
        <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700">
          <div className="h-9 w-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse mb-6" />
          <div className="h-4 w-full bg-gray-100 dark:bg-slate-900 rounded-full animate-pulse mb-8" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 bg-gray-50 dark:bg-slate-900 rounded-2xl animate-pulse mb-3" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <section id="packing" className="py-4 md:py-12 transition-colors duration-300 scroll-mt-28">
      {/* Header */}
      <div className="text-center mb-6 md:mb-10">
        <div className="inline-block bg-teal-100 dark:bg-teal-900/30 text-teal-800 dark:text-teal-200 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Packing Checklist</div>
        <h2 className="text-3xl md:text-5xl font-black mb-3">🧳 行李清單</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">已打包 {packedItems} / {totalItems} 項物品</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-slate-700 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-black text-gray-500">打包進度</span>
          <span className={`text-2xl font-black ${progress === 100 ? "text-green-700 dark:text-green-300" : "text-primary"}`}>
            {progress}%
          </span>
        </div>
        <div className="w-full h-4 bg-gray-100 dark:bg-slate-900 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${progress === 100 ? "bg-gradient-to-r from-green-400 to-emerald-500" : "bg-gradient-to-r from-primary to-accent"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
        {progress === 100 && (
          <div className="mt-3 text-center text-green-600 dark:text-green-400 font-black flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" /> 行李全部打包完成！可以安心出發了！
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {missingDefaultItems.length > 0 && (
            <button
              type="button"
              onClick={restoreDefaults}
              className="inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-primary/30 text-primary bg-primary/5 active:scale-95"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {totalItems === 0 ? "載入建議清單" : `補上建議清單（${missingDefaultItems.length}）`}
            </button>
          )}
          <button
            type="button"
            onClick={uncheckAll}
            disabled={packedItems === 0}
            className="inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-slate-900 active:scale-95 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            全部消勾
          </button>
          <button
            type="button"
            onClick={() => void exportAsText()}
            className="inline-flex min-h-11 items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-black border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 bg-teal-50 dark:bg-teal-900/20 active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            匯出文字
          </button>
        </div>
      </div>

      {/* Category Groups */}
      <div className="space-y-4 mb-8">
        {categories.map((cat, categoryIndex) => {
          const items = currentList.filter(i => i.category === cat);
          const catPacked = items.filter(i => i.packed).length;
          const isExpanded = expandedCats.has(cat);
          const panelId = `packing-category-${categoryIndex}`;

          return (
            <div key={cat} className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                aria-expanded={isExpanded}
                aria-controls={panelId}
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden="true" className="text-2xl">{getCategoryIcon(cat)}</span>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">{cat}</h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {catPacked}/{items.length}
                  </span>
                </div>
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </button>

              <div id={panelId} hidden={!isExpanded} className="px-5 pb-5 space-y-2">
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 p-3 rounded-2xl transition-all ${item.packed ? "bg-green-50 dark:bg-green-900/10" : "bg-gray-50 dark:bg-slate-900"}`}
                    >
                      <button
                        onClick={() => togglePacked(item.id)}
                        aria-label={item.packed ? `取消標記「${item.name}」為已打包` : `標記「${item.name}」為已打包`}
                        className={`w-11 h-11 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 ${item.packed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 dark:border-slate-600 hover:border-primary"}`}
                      >
                        {item.packed && <Check className="w-5 h-5" />}
                      </button>
                      <span className={`flex-1 font-bold ${item.packed ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                        {item.name}
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        aria-label={`刪除「${item.name}」`}
                        className="w-11 h-11 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-xl transition-colors"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Item */}
      {showAdd ? (
        <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-slate-700">
          <h3 className="font-black text-lg mb-4 text-gray-900 dark:text-white">新增物品</h3>
          <div className="space-y-3">
            <label htmlFor="packing-item-name" className="sr-only">物品名稱</label>
            <input
              id="packing-item-name"
              type="text"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addItem(); }}
              placeholder="輸入物品名稱..."
              autoFocus
              className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold"
            />
            <label htmlFor="packing-item-category" className="sr-only">物品分類</label>
            <select
              id="packing-item-category"
              value={newItemCategory}
              onChange={e => setNewItemCategory(e.target.value)}
              className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold"
            >
              {Object.keys(DEFAULT_CATEGORIES).map(cat => (
                <option key={cat} value={cat}>{getCategoryIcon(cat)} {cat}</option>
              ))}
            </select>
            <div className="flex gap-3">
              <button
                onClick={addItem}
                className="flex-1 py-4 rounded-2xl font-black bg-primary text-white active:scale-95 transition-transform flex items-center justify-center gap-2"
              >
                <Plus className="w-5 h-5" /> 新增
              </button>
              <button
                onClick={() => { setShowAdd(false); setNewItemName(""); }}
                className="px-6 py-4 rounded-2xl font-bold bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-gray-300 active:scale-95 transition-transform"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowAdd(true)}
          className="w-full p-5 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl text-gray-400 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 font-black uppercase tracking-widest"
        >
          <Plus className="w-6 h-6" /> 新增物品
        </button>
      )}

      {/* ── Weather-Based Packing Tips ── */}
      <div className="mt-6 bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-slate-800 dark:to-slate-800 rounded-[2rem] p-6 border border-yellow-100 dark:border-slate-700">
        <h3 className="text-lg font-black mb-4 flex items-center gap-2">
          🌦️ 根據 9 月東京天氣建議
        </h3>
        <div className="flex flex-wrap gap-2 text-sm mb-4">
          <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full font-bold">👕 透氣短袖 4-5 件</span>
          <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full font-bold">🧥 冷氣房用薄外套 1 件</span>
          <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full font-bold">☔ 摺疊傘</span>
          <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full font-bold">👟 舒適步行鞋</span>
          <span className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full font-bold">🔌 台灣兩扁腳通常可直接使用</span>
          <span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-full font-bold">💊 個人藥品</span>
          <span className="px-3 py-1.5 bg-pink-100 dark:bg-pink-900/30 rounded-full font-bold">🧴 防曬乳 SPF50+</span>
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full font-bold">😷 口罩</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-300">
          <span className="text-lg">💡</span>
          <p>9 月上旬東京通常仍炎熱潮濕，以透氣短袖為主；薄外套留給冷氣房。日本為 100V、常見兩扁腳插座，請先確認充電器支援 100V，三腳插頭才需轉接頭。颱風季請出發前再看即時預報。</p>
        </div>
        <div role="note" className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-black leading-relaxed text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          🔋 星宇航空自 2026/4/1 起：行動電源最多 2 顆、每顆 ≤100Wh，必須隨身攜帶且不可託運；機上禁止使用或充電，也不可放入頭頂置物櫃，請放在前方座椅下。其他備用鋰電池同樣不可託運。{" "}
          <a
            href="https://latestnews.starlux-airlines.com/en-JP/about-us/travel-advisories/advisories/latest-news/safety-regulations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 items-center px-1 underline underline-offset-2"
          >
            查看星宇最新規定
          </a>
        </div>
      </div>
    </section>
  );
}
