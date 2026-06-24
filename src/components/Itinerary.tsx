"use client";

import { useState, useRef } from "react";
import { Calendar, Check, ChevronDown, Pencil, Plus, Trash2, X, Download, Loader2 } from "lucide-react";
import { useTripState, Itinerary as ItineraryType, Activity } from "@/hooks/useTripState";
import html2canvas from "html2canvas";

const DEFAULT_ITINERARY: ItineraryType = {
  day1: {
    title: "🛬 Day 1 - 抵達東京",
    date: "9/1 (二)",
    activities: [
      { time: "12:55", name: "抵達成田機場", desc: "辦理入境手續、領取行李", tag: "交通" },
      { time: "14:30", name: "前往飯店", desc: "搭乘成田特快 → 錦糸町站", tag: "交通" },
      { time: "16:00", name: "飯店 Check-in", desc: "東武黎凡特飯店", tag: "" },
      { time: "16:30", name: "淺草寺・雷門", desc: "東京最古老的寺廟", tag: "景點" },
      { time: "18:30", name: "晴空塔", desc: "欣賞夜景", tag: "景點" },
      { time: "20:00", name: "晚餐", desc: "淺草老字號天婦羅", tag: "美食" },
      { time: "21:30", name: "回飯店休息", desc: "享受大浴場", tag: "" }
    ]
  },
  day2: {
    title: "⛩️ Day 2 - 澀谷・新宿",
    date: "9/2 (三)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "明治神宮", desc: "東京最大的神社", tag: "景點" },
      { time: "11:30", name: "原宿竹下通", desc: "年輕人潮流聖地", tag: "購物" },
      { time: "13:00", name: "午餐：拉麵", desc: "一蘭拉麵", tag: "美食" },
      { time: "14:30", name: "澀谷 Scramble Square", desc: "Sky 展望台", tag: "景點" },
      { time: "17:00", name: "新宿御苑", desc: "欣賞日式庭園", tag: "景點" },
      { time: "19:00", name: "晚餐：思出橫丁", desc: "串燒與關東煮", tag: "美食" }
    ]
  },
  day3: {
    title: "🏰 Day 3 - 秋葉原・東京車站",
    date: "9/3 (四)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "秋葉原電氣街", desc: "動漫、電器", tag: "購物" },
      { time: "12:00", name: "午餐", desc: "秋葉原女僕咖啡廳", tag: "美食" },
      { time: "14:00", name: "東京車站一番街", desc: "地下街購物", tag: "購物" },
      { time: "15:30", name: "皇居外苑", desc: "二重橋散步", tag: "景點" },
      { time: "17:00", name: "銀座逛街", desc: "東京最高級商店街", tag: "購物" },
      { time: "19:00", name: "晚餐：銀座壽司", desc: "新鮮握壽司", tag: "美食" }
    ]
  },
  day4: {
    title: "🌊 Day 4 - 台場・豐洲",
    date: "9/4 (五)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "豐洲市場", desc: "新鮮海鮮早餐", tag: "美食" },
      { time: "11:30", name: "台場海濱公園", desc: "自由女神、彩虹大橋", tag: "景點" },
      { time: "14:30", name: "DiverCity", desc: "1:1 鋼彈模型", tag: "景點" },
      { time: "16:30", name: "teamLab Borderless", desc: "沉浸式數位藝術", tag: "景點" },
      { time: "19:00", name: "晚餐：燒肉", desc: "欣賞夜景", tag: "美食" },
      { time: "21:00", name: "台場夜景", desc: "摩天輪", tag: "景點" }
    ]
  },
  day5: {
    title: "🌸 Day 5 - 下北澤・吉祥寺",
    date: "9/5 (六)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "下北澤古著街", desc: "二手服飾", tag: "購物" },
      { time: "12:00", name: "午餐：咖哩", desc: "日式咖哩名店", tag: "美食" },
      { time: "13:30", name: "吉祥寺井之頭公園", desc: "划船、散步", tag: "景點" },
      { time: "16:30", name: "吉卜力美術館", desc: "宮崎駿動畫迷必訪", tag: "景點" },
      { time: "19:00", name: "晚餐：迴轉壽司", desc: "最後一晚的壽司", tag: "美食" },
      { time: "21:00", name: "飯店收拾行李", desc: "準備明天回程", tag: "" }
    ]
  },
  day6: {
    title: "🛫 Day 6 - 回家",
    date: "9/6 (日)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "最後一頓日式早餐", tag: "美食" },
      { time: "09:30", name: "上野阿美橫丁", desc: "採購伴手禮", tag: "購物" },
      { time: "12:00", name: "午餐", desc: "上野周邊用餐", tag: "美食" },
      { time: "14:00", name: "飯店 Check-out", desc: "寄放行李", tag: "" },
      { time: "16:00", name: "前往成田機場", desc: "JR總武線", tag: "交通" },
      { time: "20:40", name: "登機 JX805", desc: "返回台北", tag: "交通" }
    ]
  }
};

export function Itinerary() {
  const { isLoaded, itinerary, updateItinerary } = useTripState();
  const [expandedDays, setExpandedDays] = useState<string[]>(["day1"]);
  const [editingModal, setEditingModal] = useState<{ day: string; index: number } | null>(null);
  const [formData, setFormData] = useState<Activity>({ time: "", name: "", desc: "", tag: "" });
  const [isExporting, setIsExporting] = useState(false);
  const itineraryRef = useRef<HTMLDivElement>(null);

  if (!isLoaded) {
    return <div className="py-20 text-center">載入中...</div>;
  }

  const currentItin = Object.keys(itinerary).length > 0 ? itinerary : DEFAULT_ITINERARY;

  const toggleDay = (day: string) => {
    setExpandedDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const expandAll = () => {
    setExpandedDays(Object.keys(currentItin));
  };

  const openModal = (day: string, index: number = -1) => {
    if (index >= 0) {
      setFormData({ ...currentItin[day].activities[index] });
    } else {
      setFormData({ time: "", name: "", desc: "", tag: "" });
    }
    setEditingModal({ day, index });
  };

  const handleSave = () => {
    if (!editingModal || !formData.name || !formData.time) return;

    const newItin = { ...currentItin };
    const { day, index } = editingModal;

    if (index >= 0) {
      newItin[day].activities[index] = formData;
    } else {
      newItin[day].activities.push(formData);
    }

    newItin[day].activities.sort((a, b) => a.time.localeCompare(b.time));
    updateItinerary(newItin);
    setEditingModal(null);
  };

  const deleteActivity = (day: string, idx: number) => {
    if (!confirm("確定要刪除這項行程嗎？")) return;
    const newItin = { ...currentItin };
    newItin[day].activities.splice(idx, 1);
    updateItinerary(newItin);
  };

  const getTagColor = (tag: string) => {
    switch (tag) {
      case "美食": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
      case "景點": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
      case "交通": return "bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-300";
      case "購物": return "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400";
      default: return "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const handleExport = async () => {
    if (!itineraryRef.current) return;
    
    // Auto-expand all days before exporting so everything is captured
    expandAll();
    setIsExporting(true);
    
    // Give DOM time to expand all days
    setTimeout(async () => {
        try {
            const canvas = await html2canvas(itineraryRef.current!, {
                scale: 2, // High resolution
                useCORS: true,
                backgroundColor: document.documentElement.classList.contains('dark') ? '#0f172a' : '#ffffff',
                windowWidth: 1200, // Force a nice desktop-like width for the image
            });
            
            const image = canvas.toDataURL("image/png", 1.0);
            const link = document.createElement("a");
            link.href = image;
            link.download = `東京自由行_行程表_${new Date().toISOString().slice(0,10)}.png`;
            link.click();
        } catch (error) {
            console.error("Export failed:", error);
            alert("匯出圖片失敗，請稍後再試。");
        } finally {
            setIsExporting(false);
        }
    }, 500);
  };

  return (
    <section id="itinerary" className="py-20 px-4 md:px-12 max-w-5xl mx-auto transition-colors duration-300">
      <div className="text-center mb-16 relative">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Travel Timeline</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">📅 行程詳情</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-6">點擊展開每日計畫，並可自由編輯與同步</p>
        
        {/* Export Button */}
        <button 
            onClick={handleExport}
            disabled={isExporting}
            className="mx-auto flex items-center justify-center gap-2 bg-gray-900 dark:bg-white text-white dark:text-gray-900 px-6 py-3 rounded-full font-black text-sm shadow-xl hover:scale-105 transition-all disabled:opacity-50"
        >
            {isExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isExporting ? "正在產生圖片..." : "將行程表匯出為長圖"}
        </button>
      </div>

      <div className="space-y-6" ref={itineraryRef} style={{ padding: isExporting ? '2rem' : '0' }}>
        {isExporting && (
            <div className="text-center mb-10 pb-10 border-b border-gray-200 dark:border-gray-700">
                <h1 className="text-4xl font-black text-primary mb-2">東京自由行</h1>
                <p className="text-xl font-bold text-gray-500">2026.09.01 - 09.06</p>
            </div>
        )}
        {Object.entries(currentItin).map(([dayKey, dayData]) => (
          <div key={dayKey} className="bg-white dark:bg-slate-800 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-700 overflow-hidden transition-all duration-300">
            <button
              onClick={() => toggleDay(dayKey)}
              className="w-full flex items-center justify-between p-6 md:p-8 bg-gradient-to-r from-primary to-accent text-white"
            >
              <div className="flex items-center gap-4">
                 <div className="bg-white/20 p-2 rounded-xl backdrop-blur-sm">
                    <Calendar className="w-6 h-6" />
                 </div>
                 <h3 className="text-xl md:text-2xl font-black text-left leading-tight">{dayData.title}</h3>
              </div>
              <div className="flex items-center gap-4">
                <span className="hidden sm:inline-block font-black bg-white/20 px-4 py-1.5 rounded-full text-sm uppercase tracking-wider">{dayData.date}</span>
                {!isExporting && <ChevronDown className={`w-6 h-6 transition-transform duration-500 ${expandedDays.includes(dayKey) ? "rotate-180" : ""}`} />}
              </div>
            </button>

            {(expandedDays.includes(dayKey) || isExporting) && (
              <div className="p-6 md:p-10 animate-in slide-in-from-top-4 duration-500">
                <div className="space-y-8 relative before:absolute before:inset-0 before:ml-[4.5rem] md:before:ml-[5.5rem] before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-gray-200 dark:before:via-slate-700 before:to-transparent">
                  {dayData.activities.map((act, idx) => (
                    <div key={idx} className="relative flex items-start gap-6 md:gap-10 group">
                      {/* Dot */}
                      <div className="flex items-center justify-center w-6 h-6 rounded-full border-4 border-white dark:border-slate-800 bg-primary absolute left-[4.5rem] md:left-[5.5rem] -translate-x-1/2 z-10 shadow-lg group-hover:scale-125 transition-transform"></div>
                      
                      {/* Time */}
                      <div className="w-[4.5rem] md:w-[5.5rem] pr-2 md:pr-3 text-right text-primary font-black text-xl md:text-2xl pt-0.5 shrink-0 tabular-nums">
                        {act.time}
                      </div>

                      {/* Content Card */}
                      <div className="flex-1 pb-2">
                        <div className="bg-gray-50 dark:bg-slate-900/50 p-5 md:p-6 rounded-[1.5rem] shadow-sm border border-gray-100 dark:border-slate-800 hover:shadow-xl hover:-translate-y-1 transition-all relative group/card overflow-hidden">
                          <div className="absolute top-0 right-0 w-2 h-full bg-primary opacity-0 group-hover/card:opacity-100 transition-opacity"></div>
                          
                          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                             <h4 className="font-black text-xl md:text-2xl text-gray-900 dark:text-white leading-tight">{act.name}</h4>
                             {act.tag && (
                                <span className={`self-start text-[10px] sm:text-xs font-black px-3 py-1 rounded-lg uppercase tracking-widest ${getTagColor(act.tag)}`}>
                                {act.tag}
                                </span>
                            )}
                          </div>

                          {act.desc && <p className="text-base text-gray-500 dark:text-gray-400 leading-relaxed mb-4">{act.desc}</p>}
                          
                          {!isExporting && (
                            <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-all duration-300">
                                <button onClick={() => openModal(dayKey, idx)} className="text-primary hover:bg-primary/10 p-2 rounded-xl transition-colors">
                                <Pencil className="w-4 h-4" />
                                </button>
                                <button onClick={() => deleteActivity(dayKey, idx)} className="text-red-500 hover:bg-red-50 p-2 rounded-xl transition-colors">
                                <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {!isExporting && (
                    <button 
                    onClick={() => openModal(dayKey)}
                    className="w-full mt-10 p-5 border-2 border-dashed border-gray-200 dark:border-slate-700 rounded-3xl text-gray-400 hover:text-primary hover:border-primary hover:bg-primary/5 transition-all flex items-center justify-center gap-3 font-black uppercase tracking-widest"
                    >
                    <Plus className="w-6 h-6" /> 新增行程活動
                    </button>
                )}
              </div>
            )}
          </div>
        ))}
        {isExporting && (
            <div className="text-center pt-8 text-gray-400 font-bold text-sm">
                Made with ❤️ Tokyo Trip Planner
            </div>
        )}
      </div>

      {/* Edit/Add Modal - Mobile Perfected */}
      {editingModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-300">
          <div className="bg-white dark:bg-slate-800 w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300">
            <div className="p-6 md:p-8 bg-gradient-to-r from-primary to-accent text-white flex justify-between items-center">
              <div className="flex items-center gap-3">
                 <div className="bg-white/20 p-2 rounded-xl"><Calendar className="w-5 h-5"/></div>
                 <h3 className="text-2xl font-black">{editingModal.index >= 0 ? "編輯計畫" : "新增計畫"}</h3>
              </div>
              <button onClick={() => setEditingModal(null)} className="p-2 hover:bg-white/20 rounded-full transition-colors">
                <X className="w-6 h-6" />
              </button>
            </div>
            
            <div className="p-6 md:p-10 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">抵達時間</label>
                  <input 
                    type="time" 
                    value={formData.time} 
                    onChange={e => setFormData({...formData, time: e.target.value})}
                    className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-black text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">活動類型</label>
                  <select 
                    value={formData.tag} 
                    onChange={e => setFormData({...formData, tag: e.target.value})}
                    className="w-full p-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold"
                  >
                    <option value="">無標籤</option>
                    <option value="美食">🍜 美食</option>
                    <option value="景點">📍 景點</option>
                    <option value="交通">🚆 交通</option>
                    <option value="購物">🛍️ 購物</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">景點或店名</label>
                <input 
                  type="text" 
                  placeholder="例如：東京鐵塔、築地市場..."
                  value={formData.name} 
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-black text-xl"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] sm:text-xs font-black text-gray-400 uppercase tracking-widest ml-1">詳細說明</label>
                <textarea 
                  placeholder="補充交通資訊、門票價格、想吃的料理..."
                  value={formData.desc} 
                  onChange={e => setFormData({...formData, desc: e.target.value})}
                  className="w-full p-5 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all h-32 leading-relaxed text-sm font-medium"
                />
              </div>

              <div className="pt-4 flex gap-4">
                <button 
                  onClick={handleSave}
                  className="flex-1 py-5 rounded-[1.5rem] font-black bg-primary text-white hover:bg-primary-dark shadow-xl shadow-primary/30 transition-all flex items-center justify-center gap-3 uppercase tracking-widest"
                >
                  <Check className="w-6 h-6" /> 儲存變更
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
