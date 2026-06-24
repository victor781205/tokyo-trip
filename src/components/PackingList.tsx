"use client";

import { useState } from "react";
import { Luggage, Plus, X, Check, ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";

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

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

export function PackingList() {
  const { isLoaded, packingList, updatePackingList } = useTripState();
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("其他");
  const [showAdd, setShowAdd] = useState(false);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(Object.keys(DEFAULT_CATEGORIES)));
  const [hasInitialized, setHasInitialized] = useState(false);

  // Initialize defaults if empty
  const currentList: PackingItem[] = (() => {
    if (packingList && packingList.length > 0) return packingList;
    if (!hasInitialized && isLoaded) {
      const defaults: PackingItem[] = [];
      for (const [cat, data] of Object.entries(DEFAULT_CATEGORIES)) {
        for (const item of data.items) {
          defaults.push({ id: generateId(), name: item, packed: false, category: cat });
        }
      }
      // Defer to avoid state update during render
      setTimeout(() => {
        updatePackingList(defaults);
        setHasInitialized(true);
      }, 0);
      return defaults;
    }
    return packingList || [];
  })();

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
      { id: generateId(), name: newItemName.trim(), packed: false, category: newItemCategory },
    ];
    updatePackingList(updated);
    setNewItemName("");
    setShowAdd(false);
  };

  const removeItem = (id: string) => {
    const updated = currentList.filter(item => item.id !== id);
    updatePackingList(updated);
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
      <section className="py-20 px-4 md:px-6 max-w-4xl mx-auto">
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
    <section id="packing" className="py-20 px-4 md:px-6 lg:px-8 max-w-4xl mx-auto transition-colors duration-300">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-block bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Packing Checklist</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">🧳 行李清單</h2>
        <p className="text-gray-600 dark:text-gray-400">已打包 {packedItems} / {totalItems} 項物品</p>
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
                        className={`w-7 h-7 rounded-xl border-2 flex items-center justify-center transition-all shrink-0 ${item.packed ? "bg-green-500 border-green-500 text-white" : "border-gray-300 dark:border-slate-600 hover:border-primary"}`}
                      >
                        {item.packed && <Check className="w-4 h-4" />}
                      </button>
                      <span className={`flex-1 font-bold ${item.packed ? "line-through text-gray-400 dark:text-gray-500" : "text-gray-900 dark:text-white"}`}>
                        {item.name}
                      </span>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                      >
                        <X className="w-4 h-4" />
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
          <h4 className="font-black text-lg mb-4 text-gray-900 dark:text-white">新增物品</h4>
          <div className="space-y-3">
            <input
              type="text"
              value={newItemName}
              onChange={e => setNewItemName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addItem(); }}
              placeholder="輸入物品名稱..."
              autoFocus
              className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold"
            />
            <select
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
    </section>
  );
}
