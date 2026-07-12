"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, X, Check, ChevronDown, ChevronRight, Sparkles, RotateCcw, Download } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { generateShortId } from "@/lib/secure-id";

export interface PackingItem {
  id: string;
  name: string;
  packed: boolean;
  category: string;
}

const DEFAULT_CATEGORIES: Record<string, { icon: string; items: string[] }> = {
  "衣物": {
    icon: "👕",
    items: ["T恤 ×5", "內衣褲 ×6", "襪子 ×5", "外套", "睡衣", "泳衣", "帽子", "拖鞋", "運動鞋"],
  },
  "證件": {
    icon: "📄",
    items: ["護照", "身分證", "機票 (電子)", "飯店訂房確認", "旅遊保險單", "信用卡", "日幣現金"],
  },
  "電子用品": {
    icon: "🔌",
    items: ["手機", "充電器", "行動電源", "耳機", "相機", "萬用轉接頭", "USB 線"],
  },
  "日用品": {
    icon: "🧴",
    items: ["牙刷牙膏", "洗面乳", "防曬乳", "面膜", "衛生紙", "濕紙巾", "雨傘", "水壺"],
  },
  "藥品": {
    icon: "💊",
    items: ["感冒藥", "腸胃藥", "止痛藥", "OK繃", "防蚊液", "暈車藥", "眼藥水"],
  },
  "其他": {
    icon: "📦",
    items: ["塑膠袋", "夾鏈袋", "旅行用洗衣精", "摺疊購物袋", "頸枕", "眼罩"],
  },
};

function createDefaultPackingItems(): PackingItem[] {
  return Object.entries(DEFAULT_CATEGORIES).flatMap(([category, data]) =>
    data.items.map((name) => ({
      id: generateShortId(),
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
  const [defaultItems] = useState(createDefaultPackingItems);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!isLoaded || packingList.length > 0 || initializedRef.current) return;
    initializedRef.current = true;
    updatePackingList(defaultItems);
  }, [defaultItems, isLoaded, packingList.length, updatePackingList]);

  const currentList: PackingItem[] = packingList.length > 0
    ? packingList
    : isLoaded
      ? defaultItems
      : [];

  const categories = Array.from(new Set(currentList.map(i => i.category)));
  const totalItems = currentList.length;
  const packedItems = currentList.filter(i => i.packed).length;
  const progress = totalItems > 0 ? Math.round((packedItems / totalItems) * 100) : 0;

  const togglePacked = (id: string) => {
    const updated = currentList.map(item =>
      item.id === id ? { ...item, packed: !item.packed } : item
    );
    updatePackingList(updated);
  };

  const addItem = () => {
    if (!newItemName.trim()) return;
    const updated = [
      ...currentList,
      { id: generateShortId(), name: newItemName.trim(), packed: false, category: newItemCategory },
    ];
    updatePackingList(updated);
    setNewItemName("");
    setShowAdd(false);
  };

  const removeItem = (id: string) => {
    const updated = currentList.filter(item => item.id !== id);
    updatePackingList(updated);
  };

  /** 一鍵取消全部勾選（重打包） */
  const uncheckAll = () => {
    if (packedItems === 0) return;
    updatePackingList(currentList.map((item) => ({ ...item, packed: false })));
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
        <div className="inline-block bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Packing Checklist</div>
        <h2 className="text-3xl md:text-5xl font-black mb-3">🧳 行李清單</h2>
        <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base">已打包 {packedItems} / {totalItems} 項物品</p>
      </div>

      {/* Progress Bar */}
      <div className="bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-xl border border-gray-100 dark:border-slate-700 mb-8">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-black text-gray-500">打包進度</span>
          <span className={`text-2xl font-black ${progress === 100 ? "text-green-500" : "text-primary"}`}>
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
        {categories.map((cat) => {
          const items = currentList.filter(i => i.category === cat);
          const catPacked = items.filter(i => i.packed).length;
          const isExpanded = expandedCats.has(cat);

          return (
            <div key={cat} className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getCategoryIcon(cat)}</span>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">{cat}</h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                    {catPacked}/{items.length}
                  </span>
                </div>
                {isExpanded ? <ChevronDown className="w-5 h-5 text-gray-400" /> : <ChevronRight className="w-5 h-5 text-gray-400" />}
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-2">
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
              )}
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
          <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full font-bold">👕 薄長袖 3-4 件</span>
          <span className="px-3 py-1.5 bg-yellow-100 dark:bg-yellow-900/30 rounded-full font-bold">🧥 薄外套 1 件</span>
          <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full font-bold">☔ 摺疊傘</span>
          <span className="px-3 py-1.5 bg-blue-100 dark:bg-blue-900/30 rounded-full font-bold">👟 舒適步行鞋</span>
          <span className="px-3 py-1.5 bg-purple-100 dark:bg-purple-900/30 rounded-full font-bold">🔌 萬用轉接頭</span>
          <span className="px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-full font-bold">💊 個人藥品</span>
          <span className="px-3 py-1.5 bg-pink-100 dark:bg-pink-900/30 rounded-full font-bold">🧴 防曬乳 SPF50+</span>
          <span className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 rounded-full font-bold">😷 口罩</span>
        </div>
        <div className="flex items-start gap-2 text-xs text-gray-500">
          <span className="text-lg">💡</span>
          <p>9 月東京氣溫約 23-30°C，午後常有雷陣雨，建議隨身攜帶雨具和薄外套。颱風季節請關注天氣預報。</p>
        </div>
      </div>
    </section>
  );
}
