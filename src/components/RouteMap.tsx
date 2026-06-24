"use client";

import { useState } from "react";
import { Search, MapPin, ArrowRightLeft, Train, Navigation, Info, Map as MapIcon, X, Wallet, Tag, Calendar } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";

export function RouteMap() {
    const [origin, setOrigin] = useState("東京東武黎凡特飯店");
    const [destination, setDestination] = useState("");
    const [isSearched, setIsSearched] = useState(false);
    const [showItineraryRoutes, setShowItineraryRoutes] = useState(false);

    const { itinerary } = useTripState();

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (!destination) return;
        setIsSearched(true);
    };

    const handleQuickSpot = (name: string) => {
        setDestination(name);
        setIsSearched(true);
    };

    const swapPlaces = () => {
        const temp = origin;
        setOrigin(destination || "東京東武黎凡特飯店");
        setDestination(temp);
    };

    const quickSpots = [
        { name: "澀谷", fare: "約 ¥230" },
        { name: "新宿", fare: "約 ¥230" },
        { name: "東京車站", fare: "約 ¥170" },
        { name: "淺草雷門", fare: "約 ¥180" },
        { name: "秋葉原", fare: "約 ¥170" },
        { name: "成田機場", fare: "約 ¥1,350" },
    ];

    // Google Maps Embed API (with API key for Directions)
    const mapsApiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
    const directionsEmbedUrl = `https://www.google.com/maps/embed/v1/directions?key=${mapsApiKey}&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&mode=transit&language=zh-TW`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

    // 從行程中取得所有地點，按天分組
    const itineraryPlaces = Object.entries(itinerary).map(([dayKey, dayPlan]) => {
        const places = dayPlan.activities
            .map(a => a.name)
            .filter(name => name && !name.includes("飯店") && !name.includes("回") && !name.includes("休息") && !name.includes("收拾"));
        return { dayKey, title: dayPlan.title, date: dayPlan.date, places };
    }).filter(d => d.places.length > 0);

    return (
        <section id="routemap" className="py-20 px-4 md:px-12 max-w-6xl mx-auto transition-colors duration-300">
            <div className="text-center mb-16">
                <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Internal Transit System</div>
                <h2 className="text-3xl md:text-5xl font-black mb-4">🗺️ 智慧交通規劃</h2>
                <p className="text-gray-600 dark:text-gray-400">一站式查詢轉乘路線，並預覽行程所需車資</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                {/* Search Panel */}
                <div className={`${isSearched ? 'lg:col-span-4' : 'lg:col-span-12 max-w-3xl mx-auto'} w-full transition-all duration-500`}>
                    <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] p-6 md:p-8 shadow-2xl border border-gray-100 dark:border-slate-700 relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-accent"></div>
                        <h3 className="text-2xl font-bold mb-8 flex items-center gap-2">
                            <Navigation className="text-primary w-6 h-6" /> 即時路線查詢
                        </h3>

                        <form onSubmit={handleSearch} className="space-y-6">
                            <div className="space-y-4">
                                <div className="relative group">
                                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">起點</label>
                                    <div className="absolute left-4 top-[44px] text-gray-400"><MapPin className="w-4 h-4" /></div>
                                    <input
                                        type="text"
                                        value={origin}
                                        onChange={e => setOrigin(e.target.value)}
                                        className="w-full p-4 pl-10 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold text-base"
                                        placeholder="輸入起點..."
                                    />
                                </div>

                                <div className="flex justify-center -my-2 relative z-10">
                                    <button
                                        type="button"
                                        onClick={swapPlaces}
                                        className="p-2 bg-white dark:bg-slate-800 border-2 border-gray-100 dark:border-slate-700 hover:text-primary rounded-full transition-all shadow-md active:scale-90"
                                    >
                                        <ArrowRightLeft className="w-4 h-4 rotate-90" />
                                    </button>
                                </div>

                                <div className="relative group">
                                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">目的地</label>
                                    <div className="absolute left-4 top-[44px] text-gray-400"><Search className="w-4 h-4" /></div>
                                    <input
                                        type="text"
                                        value={destination}
                                        onChange={e => setDestination(e.target.value)}
                                        className="w-full p-4 pl-10 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-bold text-primary text-base"
                                        placeholder="要去哪裡？"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-3 gap-2 pt-2">
                                {quickSpots.map(spot => (
                                    <button
                                        key={spot.name}
                                        type="button"
                                        onClick={() => handleQuickSpot(spot.name)}
                                        className="flex flex-col items-center p-2 rounded-xl bg-gray-50 dark:bg-slate-900 hover:bg-primary/10 hover:text-primary transition-all border border-gray-100 dark:border-slate-800"
                                    >
                                        <span className="text-sm font-black">{spot.name}</span>
                                        <span className="text-xs text-gray-400 font-bold italic">{spot.fare}</span>
                                    </button>
                                ))}
                            </div>

                            <button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary-dark text-white font-black py-4 rounded-2xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-3"
                            >
                                <Train className="w-5 h-5" /> 立即查詢路線
                            </button>
                        </form>

                        {/* 行程路線快速入口 */}
                        {itineraryPlaces.length > 0 && (
                            <div className="mt-6 pt-6 border-t border-gray-100 dark:border-slate-700">
                                <button
                                    onClick={() => setShowItineraryRoutes(!showItineraryRoutes)}
                                    className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-900 rounded-2xl hover:bg-primary/5 transition-all"
                                >
                                    <span className="flex items-center gap-2 font-black text-sm">
                                        <Calendar className="w-4 h-4 text-primary" /> 依行程查詢路線
                                    </span>
                                    <span className="text-xs text-gray-400">{showItineraryRoutes ? "收起" : "展開"}</span>
                                </button>

                                {showItineraryRoutes && (
                                    <div className="mt-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                                        {itineraryPlaces.map(day => (
                                            <div key={day.dayKey} className="bg-gray-50 dark:bg-slate-900 rounded-2xl p-3">
                                                <div className="text-xs font-black text-primary mb-2">{day.title}</div>
                                                <div className="flex flex-wrap gap-1.5">
                                                    {day.places.map((place, i) => (
                                                        <button
                                                            key={i}
                                                            onClick={() => handleQuickSpot(place)}
                                                            className="text-xs bg-white dark:bg-slate-800 px-2.5 py-1.5 rounded-lg font-bold border border-gray-100 dark:border-slate-700 hover:border-primary hover:text-primary transition-all"
                                                        >
                                                            {place}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                {/* Internal Display Result */}
                {isSearched && (
                    <div className="lg:col-span-8 w-full animate-in fade-in slide-in-from-right-8 duration-700">
                        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden flex flex-col h-[600px]">
                            <div className="p-6 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center">
                                <div className="flex items-center gap-3">
                                    <div className="bg-primary/10 p-2 rounded-xl text-primary"><MapIcon className="w-5 h-5" /></div>
                                    <div>
                                        <h4 className="font-black text-base">{origin} → {destination}</h4>
                                        <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">Transit Directions</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsSearched(false)} className="p-2 hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full"><X className="w-4 h-4" /></button>
                            </div>

                            <div className="flex-1 relative bg-slate-100">
                                <iframe
                                    src={directionsEmbedUrl}
                                    className="w-full h-full border-0"
                                    allowFullScreen
                                    loading="lazy"
                                ></iframe>
                            </div>

                            <div className="p-6 md:p-8 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-orange-500/10 p-3 rounded-2xl text-orange-500 shrink-0">
                                            <Wallet className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h5 className="font-black text-base mb-1 text-orange-600 uppercase tracking-widest">車資預估</h5>
                                            <p className="text-sm text-gray-500 leading-relaxed font-bold">
                                                {(() => {
                                                    const matched = quickSpots.find(s => destination.includes(s.name));
                                                    if (matched) return <>預估車資 <span className="text-primary font-black">{matched.fare}</span></>;
                                                    return <>一般電車單程約 <span className="text-primary font-black">¥170 ~ ¥400</span>，實際票價依路線而定</>;
                                                })()}
                                                <br />
                                                <span className="text-xs opacity-70">從 {origin} 出發，使用 Suica/PASMO 搭乘電車</span>
                                            </p>
                                        </div>
                                    </div>
                                    <a
                                        href={googleMapsUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="bg-primary hover:bg-primary-dark text-white py-4 rounded-2xl font-black shadow-xl shadow-primary/20 transition-all flex items-center justify-center gap-3 active:scale-95"
                                    >
                                        <Navigation className="w-5 h-5" /> 開啟 Google Maps 導航
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {!isSearched && (
                <div className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto animate-in fade-in duration-1000">
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-8 rounded-[2.5rem] border border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-3 mb-4">
                            <Info className="w-6 h-6 text-blue-500" />
                            <h4 className="text-xl font-black text-blue-600">使用提示</h4>
                        </div>
                        <ul className="text-sm text-blue-500/80 space-y-2 font-bold leading-relaxed">
                            <li>• 輸入起點與目的地即可在頁面內預覽路線規劃</li>
                            <li>• 點擊快速標籤可預覽常用景點車資</li>
                            <li>• 展開「依行程查詢路線」可快速查看各景點交通</li>
                        </ul>
                    </div>

                    <div className="bg-green-50/50 dark:bg-green-900/10 p-8 rounded-[2.5rem] border border-green-100 dark:border-green-900/30">
                        <div className="flex items-center gap-3 mb-4">
                            <Tag className="w-6 h-6 text-green-500" />
                            <h4 className="text-xl font-black text-green-600">車資省錢小撇步</h4>
                        </div>
                        <ul className="text-sm text-green-500/80 space-y-2 font-bold leading-relaxed">
                            <li>• 使用 Suica/PASMO 刷卡通常比買票便宜</li>
                            <li>• 錦糸町前往市中心 (新宿/澀谷) 固定約 ¥230</li>
                            <li>• 善用「地鐵 24/48/72 小時券」可大幅省錢</li>
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
