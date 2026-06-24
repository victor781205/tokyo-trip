"use client";

import { useState } from "react";
import { Loader2, MapPin, Navigation, Plus, Search, Star, Trash2, Utensils } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";

const FOOD_CATEGORIES = [
    { id: "ramen", label: "拉麵", icon: "🍜" },
    { id: "sushi", label: "壽司", icon: "🍣" },
    { id: "yakiniku", label: "燒肉/和牛", icon: "🥩" },
    { id: "cafe", label: "甜點/咖啡", icon: "🍰" },
    { id: "local", label: "居酒屋/在地", icon: "🍺" },
    { id: "global", label: "洋食/其他", icon: "🍱" },
];

const RECOMMENDED_FOODS: Record<string, Record<string, string>[]> = {
    ramen: [
        { name: "一蘭 澀谷店", star: "4.5", reviews: "12,000+", loc: "澀谷", desc: "全球最知名的豚骨拉麵，客製化口味必試。" },
        { name: "AFURI 原宿", star: "4.5", reviews: "5,500+", loc: "原宿", desc: "招牌柚子鹽拉麵，清爽不膩的高級口感。" },
        { name: "風雲兒", star: "4.6", reviews: "4,800+", loc: "新宿", desc: "東京最強沾麵之一，濃郁魚介豚骨湯頭。" },
        { name: "真鯛らーめん 面魚", star: "4.5", reviews: "2,200+", loc: "錦糸町 (飯店旁)", desc: "使用宇和島產真鯛熬製，極致鮮美的在地名店。" },
        { name: "六厘舍", star: "4.5", reviews: "6,000+", loc: "東京車站", desc: "拉麵街排隊王，超濃厚沾麵的代名詞。" },
        { name: "銀座 篝 (Kagari)", star: "4.5", reviews: "3,200+", loc: "銀座", desc: "米其林推薦，如濃湯般甘甜的雞白湯拉麵。" },
        { name: "入鹿 TOKYO", star: "4.7", reviews: "1,500+", loc: "六本木", desc: "多重湯頭揉合，精緻如法式料理的拉麵。" },
        { name: "麵屋武藏 新宿本店", star: "4.5", reviews: "4,500+", loc: "新宿", desc: "豪邁的叉燒塊與濃郁湯頭，飽足感十足。" },
        { name: "鴨 to 蔥", star: "4.5", reviews: "2,800+", loc: "上野", desc: "僅用鴨、蔥、水熬煮，純粹且深邃的美味。" },
        { name: "金色不如歸", star: "4.5", reviews: "1,800+", loc: "新宿", desc: "米其林一星，蛤蜊與松露香氣的完美結合。" },
    ],
    sushi: [
        { name: "壽司大 (Sushi Dai)", star: "4.6", reviews: "3,500+", loc: "豐洲市場", desc: "東京第一名店，清晨排隊也值得的終極鮮味。" },
        { name: "美登利壽司總本店", star: "4.5", reviews: "4,200+", loc: "梅丘/澀谷", desc: "高 CP 值精品壽司，食材大方新鮮。" },
        { name: "根室花丸 銀座店", star: "4.5", reviews: "3,800+", loc: "銀座", desc: "來自北海道的迴轉壽司，鮮度與種類驚人。" },
        { name: "壽司郎 Asakusa", star: "4.5", reviews: "5,000+", loc: "淺草", desc: "全球旗艦店，種類豐富且環境舒適。" },
        { name: "まんてん鮨 (Manten)", star: "4.6", reviews: "1,200+", loc: "丸之內", desc: "高級 Omakase 的親民選擇，預約困難店。" },
        { name: "銀座 久兵衛", star: "4.5", reviews: "1,800+", loc: "銀座", desc: "江戶前壽司的殿堂，極致的職人服務。" },
        { name: "沼津港 新宿店", star: "4.5", reviews: "2,500+", loc: "新宿", desc: "新宿最受歡迎的迴轉壽司，海膽極鮮。" },
        { name: "くら寿司 押上店", star: "4.5", reviews: "3,200+", loc: "押上 (晴空塔)", desc: "全球最大規模旗艦店，好玩又好吃。" },
        { name: "元祖壽司 錦糸町店", star: "4.4", reviews: "1,100+", loc: "錦糸町", desc: "飯店旁的平價好選擇，在地評論極佳。" },
        { name: "築地虎杖 丹後", star: "4.5", reviews: "2,100+", loc: "築地", desc: "招牌海鮮丼飯「海鮮珠寶盒」創始店。" },
    ],
    yakiniku: [
        { name: "敘敘苑 遊玄亭", star: "4.6", reviews: "2,500+", loc: "新宿/晴空塔", desc: "燒肉界的奢華代表，服務與肉質無可挑剔。" },
        { name: "六歌仙 (Rokkasen)", star: "4.7", reviews: "6,500+", loc: "新宿", desc: "超人氣和牛吃到飽，遊客心中的 No.1。" },
        { name: "牛炸串本村 (Motomura)", star: "4.8", reviews: "8,500+", loc: "澀谷/新宿", desc: "排隊神店，三分熟炸牛排石板自烤。" },
        { name: "肉之萬世", star: "4.5", reviews: "3,200+", loc: "秋葉原", desc: "整棟都是肉料理，頂級黑毛和牛壽喜燒。" },
        { name: "燒肉 LIKE 錦糸町", star: "4.5", reviews: "1,500+", loc: "錦糸町", desc: "個人燒肉首選，快速、平價且肉質有水準。" },
        { name: "USHIGORO S.", star: "4.7", reviews: "1,200+", loc: "銀座", desc: "精品級全包廂服務，只提供最高等級 A5 和牛。" },
        { name: "薩摩牛 藏", star: "4.6", reviews: "1,800+", loc: "澀谷", desc: "來自鹿兒島的頂級和牛，環境具現代設計感。" },
        { name: "鐵板燒 白秋", star: "4.8", reviews: "1,100+", loc: "澀谷", desc: "溫馨的家族經營店，神戶牛鐵板燒極品。" },
        { name: "土古里 新宿", star: "4.5", reviews: "2,300+", loc: "新宿", desc: "山形牛一頭買，提供各種稀有部位。" },
        { name: "今半 壽喜燒", star: "4.6", reviews: "2,800+", loc: "人形町/上野", desc: "百年老店，關東風壽喜燒的最巔峰。" },
    ],
    cafe: [
        { name: "HARBS 新宿店", star: "4.5", reviews: "3,500+", loc: "新宿", desc: "招牌水果千層蛋糕，東京甜點必排行程。" },
        { name: "藍瓶咖啡 澀谷", star: "4.5", reviews: "2,200+", loc: "澀谷", desc: "公園景觀店，極簡設計與精品手沖咖啡。" },
        { name: "星巴克 臻選® 旗艦店", star: "4.6", reviews: "15,000+", loc: "中目黑", desc: "全球僅六間的旗艦店，建築由隈研吾大師設計。" },
        { name: "淺草 梅園", star: "4.5", reviews: "1,400+", loc: "淺草", desc: "安政元年創立，招牌粟善哉是傳統甜點代表。" },
        { name: "Bills 銀座", star: "4.5", reviews: "2,800+", loc: "銀座", desc: "世界第一早餐，絲滑香蕉熱鬆餅。" },
        { name: "Qu'il fait bon", star: "4.5", reviews: "2,100+", loc: "銀座/青山", desc: "水果塔的天花板，嚴選當季最頂級果物。" },
        { name: "Tsujiri 辻利 晴空塔", star: "4.5", reviews: "1,600+", loc: "押上", desc: "抹茶控必訪，濃郁道地的京都宇治抹茶。" },
        { name: "Ginza West", star: "4.6", reviews: "1,300+", loc: "銀座", desc: "古典懷舊咖啡廳，體驗老派紳士的優雅下午茶。" },
        { name: "Café de L'Ambre", star: "4.6", reviews: "2,500+", loc: "銀座", desc: "只賣咖啡的老店，咖啡職人朝聖之地。" },
        { name: "喫茶 You", star: "4.5", reviews: "1,900+", loc: "銀座", desc: "網紅蛋包飯名店，極致絲滑的口感。" },
    ],
    local: [
        { name: "利久牛舌 晴空塔店", star: "4.5", reviews: "2,200+", loc: "押上 (飯店旁)", desc: "來自仙台的厚切牛舌，Q 彈多汁必吃。" },
        { name: "上野 大統領", star: "4.5", reviews: "3,500+", loc: "上野", desc: "最道地的立飲居酒屋，內臟煮與串燒名店。" },
        { name: "淺草 大黑家", star: "4.4", reviews: "3,800+", loc: "淺草", desc: "傳承百年的天婦羅，特製黑醬汁風味。" },
        { name: "宇牧 鰻魚飯", star: "4.6", reviews: "1,500+", loc: "上野/銀座", desc: "炭火慢烤備長炭鰻魚，肉質細緻。" },
        { name: "鳥貴族 錦糸町", star: "4.4", reviews: "1,200+", loc: "錦糸町", desc: "全品項均一價，高品質燒鳥居酒屋。" },
        { name: "三定 天婦羅", star: "4.5", reviews: "2,100+", loc: "淺草", desc: "日本最古老的天婦羅店，鄰近雷門。" },
        { name: "阿美橫丁 鐵火丼", star: "4.5", reviews: "4,000+", loc: "上野", desc: "最在地、最熱鬧的海鮮丼街頭小吃。" },
        { name: "磯丸水產 澀谷", star: "4.5", reviews: "5,000+", loc: "澀谷", desc: "24 小時營業，自己現烤活海鮮，氛圍極佳。" },
        { name: "鳥心 錦糸町", star: "4.5", reviews: "1,100+", loc: "錦糸町", desc: "飯店周邊評價最高的備長炭燒鳥店。" },
        { name: "銀座 梅林", star: "4.5", reviews: "1,900+", loc: "銀座", desc: "炸豬排鼻祖店，招牌豬排三明治必買。" },
    ],
    global: [
        { name: "銀座 煉瓦亭", star: "4.5", reviews: "2,400+", loc: "銀座", desc: "日本洋食起源，炸豬排與蛋包飯的始祖。" },
        { name: "Shake Shack 外苑", star: "4.6", reviews: "4,500+", loc: "青山", desc: "銀杏大道下的最美漢堡店。" },
        { name: "Luke's Lobster", star: "4.5", reviews: "3,200+", loc: "表參道", desc: "滿載龍蝦肉的美味三明治，街拍神店。" },
        { name: "The Apollo", star: "4.5", reviews: "1,500+", loc: "銀座", desc: "精品地中海料理，位於 Tokyu Plaza 頂層。" },
        { name: "T's TanTan", star: "4.6", reviews: "3,800+", loc: "東京車站", desc: "超人氣純素擔擔麵，口感連肉食者都驚艷。" },
        { name: "Kanda Tamagoken", star: "4.5", reviews: "1,100+", loc: "秋葉原", desc: "現做鬆軟滑蛋包飯，多種特製醬汁。" },
        { name: "Mercer Brunch", star: "4.5", reviews: "1,800+", loc: "銀座", desc: "時尚早午餐代表，招牌法式吐司精緻美味。" },
        { name: "Shake Tree", star: "4.6", reviews: "2,100+", loc: "錦糸町", desc: "無麵包肉肉漢堡，飯店周邊的網紅排隊名店。" },
        { name: "Bao Biao 銀座", star: "4.7", reviews: "1,200+", loc: "銀座", desc: "摩登亞洲融合料理，氛圍極致高級。" },
        { name: "Gonpachi Nishi-Azabu", star: "4.5", reviews: "5,500+", loc: "西麻布", desc: "《追殺比爾》場景靈感店，體驗日本盛宴氛圍。" },
    ]
};

export function Food() {
  const { customFoods, updateCustomFoods } = useTripState();
  const [activeCat, setActiveCat] = useState("ramen");
  const [url, setUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [formData, setFormData] = useState({
    emoji: "🍣", name: "", location: "", hours: "", desc: "", mapLink: "", image: "",
  });

  const [isCustomType, setIsCustomType] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("🍔");
  const [customLabel, setCustomLabel] = useState("");

  const analyzeUrl = async (inputUrl: string) => {
    if (!inputUrl.includes("google.com/maps") && !inputUrl.includes("maps.app.goo.gl")) return;
    setIsAnalyzing(true);
    try {
      const res = await fetch(`/api/map-info?url=${encodeURIComponent(inputUrl)}`);
      const data = await res.json();
      if (data.name) {
        const isStandard = FOOD_CATEGORIES.some(cat => cat.icon === data.emoji);
        if (data.emoji && !isStandard) {
            setIsCustomType(true);
            setCustomEmoji(data.emoji);
            setCustomLabel(data.category || "");
        } else {
            setIsCustomType(false);
        }

        setFormData(prev => ({
            ...prev, name: data.name, mapLink: inputUrl,
            emoji: data.emoji || prev.emoji, location: data.location || prev.location,
            hours: data.hours || prev.hours, desc: data.category ? `分類：${data.category}` : prev.desc
        }));
      }
    } catch (e) {
      console.error("Failed to analyze URL", e);
    } finally { setIsAnalyzing(false); }
  };

  const handleUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setUrl(val);
    if (val.startsWith("http")) analyzeUrl(val);
  };

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name) return;
    updateCustomFoods([{ ...formData, id: Date.now() }, ...customFoods]);
    setFormData({ emoji: "🍣", name: "", location: "", hours: "", desc: "", mapLink: "", image: "" });
    setUrl("");
    setIsCustomType(false);
    setCustomEmoji("🍔");
    setCustomLabel("");
  };

  const handleDelete = (id: number) => {
    if (!confirm("確定要刪除這筆美食嗎？")) return;
    updateCustomFoods(customFoods.filter(f => f.id !== id));
  };

  const handleNavigate = (shopName: string) => {
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shopName + " Tokyo")}`;
    window.open(url, "_blank");
  };

  return (
    <section id="food" className="py-4 px-4 md:px-12 max-w-7xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-5 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700">

        {/* Horizontal Category Switcher */}
        <div className="flex gap-2 overflow-x-auto pb-4 no-scrollbar mb-6">
            {FOOD_CATEGORIES.map(cat => (
                <button
                    key={cat.id}
                    onClick={() => setActiveCat(cat.id)}
                    className={`flex items-center gap-2 px-6 py-3 rounded-2xl font-black text-base transition-all shrink-0 ${
                        activeCat === cat.id
                        ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                        : "bg-gray-50 dark:bg-slate-900 text-gray-500 border border-transparent"
                    }`}
                >
                    <span className="text-2xl">{cat.icon}</span> {cat.label}
                </button>
            ))}
        </div>

        {/* Top 10 Grid - High info density with Navigation */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-10">
            {RECOMMENDED_FOODS[activeCat].map((item, i) => (
                <div key={i} className="bg-gray-50 dark:bg-slate-900 p-4 rounded-2xl border border-transparent hover:border-primary/20 transition-all group relative flex flex-col justify-between">
                    <div>
                        <div className="flex justify-between items-start mb-2">
                             <h4 className="font-black text-base text-gray-900 dark:text-white truncate flex-1 pr-2">{item.name}</h4>
                             <div className="flex items-center gap-1 bg-white dark:bg-slate-800 px-1.5 py-0.5 rounded-lg shadow-sm shrink-0">
                                <Star className="w-2 h-2 text-yellow-500 fill-yellow-500" />
                                <span className="text-sm font-black">{item.star}</span>
                            </div>
                        </div>
                        <div className="text-sm font-bold text-primary flex items-center gap-1 mb-2">
                            <MapPin className="w-2.5 h-2.5" /> {item.loc}
                            <span className="text-gray-400 opacity-50 ml-1">({item.reviews})</span>
                        </div>
                        <p className="text-sm text-gray-400 leading-tight line-clamp-2 italic mb-4">&ldquo;{item.desc}&rdquo;</p>
                    </div>
                    
                    <button 
                        onClick={() => handleNavigate(item.name)}
                        className="w-full py-2 bg-white dark:bg-slate-800 text-primary border border-primary/10 rounded-xl text-sm font-black flex items-center justify-center gap-2 hover:bg-primary hover:text-white transition-all active:scale-95"
                    >
                        <Navigation className="w-3 h-3" /> 立即導航
                    </button>
                </div>
            ))}
        </div>

        {/* Compact Form */}
        <div className="border-t border-gray-100 dark:border-slate-700 pt-8 mt-4">
            <h3 className="text-xl font-black mb-6 flex items-center gap-2 px-1">
                <Utensils className="text-primary w-5 h-5" /> 我的私藏美食清單
            </h3>
            <form onSubmit={handleAdd} className="bg-gray-50 dark:bg-slate-900 p-6 rounded-[2rem] space-y-6 mb-10 border border-gray-100 dark:border-slate-800">
                <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">自動解析（選擇性）</label>
                    <div className="relative group">
                        <input
                            type="text" placeholder="貼上 Google Map 分享網址自動解析店名與位置..." value={url} onChange={handleUrlChange}
                            className="w-full p-4 pl-12 pr-12 rounded-2xl border-2 border-transparent bg-white dark:bg-slate-800 focus:border-primary outline-none transition-all text-sm font-bold"
                        />
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                        {isAnalyzing && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-primary" />}
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">餐廳類型 (選填/預設 🍣)</label>
                    <div className="flex flex-wrap gap-2">
                        {FOOD_CATEGORIES.map(cat => (
                            <button
                                key={cat.id}
                                type="button"
                                onClick={() => {
                                    setIsCustomType(false);
                                    setFormData(prev => ({ ...prev, emoji: cat.icon, desc: `分類：${cat.label}` }));
                                }}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
                                    !isCustomType && formData.emoji === cat.icon
                                    ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
                                    : "bg-white dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-800"
                                }`}
                            >
                                <span className="text-lg">{cat.icon}</span>
                                <span>{cat.label}</span>
                            </button>
                        ))}
                        <button
                            type="button"
                            onClick={() => {
                                setIsCustomType(true);
                                setFormData(prev => ({ ...prev, emoji: customEmoji, desc: customLabel ? `分類：${customLabel}` : "" }));
                            }}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-black transition-all ${
                                isCustomType
                                ? "bg-primary text-white shadow-md shadow-primary/20 scale-105"
                                : "bg-white dark:bg-slate-800 text-gray-500 hover:bg-gray-100 dark:hover:bg-slate-700 border border-gray-100 dark:border-slate-800"
                            }`}
                        >
                            <span className="text-lg">✨</span>
                            <span>自定義</span>
                        </button>
                    </div>
                </div>

                {isCustomType && (
                    <div className="grid grid-cols-3 gap-2 bg-white dark:bg-slate-800 p-4 rounded-2xl border border-gray-100 dark:border-slate-700 animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="space-y-1 col-span-1">
                            <label className="text-xs font-black text-gray-400 block ml-1">圖示 Emoji</label>
                            <input 
                                type="text" 
                                placeholder="🍕" 
                                value={customEmoji} 
                                onChange={e => {
                                    setCustomEmoji(e.target.value);
                                    setFormData(prev => ({ ...prev, emoji: e.target.value }));
                                }}
                                className="w-full p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black text-center outline-none border border-transparent focus:border-primary/30"
                                maxLength={4}
                            />
                        </div>
                        <div className="space-y-1 col-span-2">
                            <label className="text-xs font-black text-gray-400 block ml-1">類型名稱</label>
                            <input 
                                type="text" 
                                placeholder="例如：比薩" 
                                value={customLabel} 
                                onChange={e => {
                                    setCustomLabel(e.target.value);
                                    setFormData(prev => ({ ...prev, desc: `分類：${e.target.value}` }));
                                }}
                                className="w-full p-2.5 rounded-xl bg-gray-50 dark:bg-slate-900 text-sm font-black outline-none border border-transparent focus:border-primary/30"
                            />
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">店名</label>
                        <input 
                            type="text" 
                            placeholder="請輸入店名" 
                            value={formData.name} 
                            onChange={e => setFormData({...formData, name: e.target.value})} 
                            className="w-full p-3.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black outline-none border border-gray-100 dark:border-slate-700 focus:border-primary" 
                            required 
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-black text-gray-400 uppercase tracking-widest block ml-1">區域/位置 (選填)</label>
                        <input 
                            type="text" 
                            placeholder="例如：澀谷 / 錦糸町" 
                            value={formData.location} 
                            onChange={e => setFormData({...formData, location: e.target.value})} 
                            className="w-full p-3.5 rounded-xl bg-white dark:bg-slate-800 text-sm font-black outline-none border border-gray-100 dark:border-slate-700 focus:border-primary" 
                        />
                    </div>
                </div>

                <button 
                    type="submit" 
                    className="w-full py-4 bg-primary text-white rounded-xl font-black text-base active:scale-95 transition-all flex items-center justify-center gap-2 shadow-lg shadow-primary/20" 
                    disabled={isAnalyzing}
                >
                    <Plus className="w-5 h-5" /> 加入我的私藏清單
                </button>
            </form>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {customFoods.map((food) => (
                    <div key={food.id} className="bg-white dark:bg-slate-800 p-4 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 relative group animate-in fade-in zoom-in duration-300">
                        <div className="text-3xl mb-3 bg-gray-50 dark:bg-slate-900 w-12 h-12 flex items-center justify-center rounded-2xl">{food.emoji}</div>
                        <h4 className="text-base font-black mb-1 truncate">{food.name}</h4>
                        <div className="text-sm text-gray-400 flex items-center gap-1 mb-4"><MapPin className="w-3 h-3" /> {food.location || "未設定"}</div>
                        <div className="flex gap-2">
                            {food.mapLink && <a href={food.mapLink} target="_blank" rel="noopener noreferrer" className="flex-1 bg-gray-50 dark:bg-slate-900 p-2 rounded-xl text-sm font-black text-center text-gray-500 hover:text-primary transition-colors border border-gray-100 dark:border-slate-700 flex items-center justify-center gap-1"><Navigation className="w-3 h-3"/> GO</a>}
                            <button onClick={() => handleDelete(food.id)} className="bg-red-50 dark:bg-red-900/10 p-2 rounded-xl text-red-400 hover:text-red-500 flex items-center justify-center"><Trash2 className="w-3 h-3" /></button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
      </div>
    </section>
  );
}
