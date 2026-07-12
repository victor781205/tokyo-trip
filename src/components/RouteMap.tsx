"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Search, MapPin, ArrowRightLeft, Train, Navigation, Info, Map as MapIcon, X, Wallet, Tag, Calendar, CreditCard } from "lucide-react";
import { useTripState } from "@/hooks/useTripState";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";

// 動態載入 RouteMapView（避免 SSR window 問題）
const RouteMapView = dynamic(() => import("./RouteMapView").then(m => m.RouteMapView), {
    ssr: false,
    loading: () => (
        <div className="w-full h-full flex items-center justify-center bg-gray-100" style={{ minHeight: "450px" }}>
            <div className="text-gray-400 font-bold text-sm">載入地圖中...</div>
        </div>
    ),
});

export function isHotelOrKinshichoOrigin(value: string) {
    const normalized = value.replace(/\s+/g, "").toLowerCase();
    return normalized.includes("東武黎凡特")
        || normalized.includes("錦糸町")
        || normalized.includes("錦絲町")
        || normalized.includes("kinshicho");
}

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
        { name: "澀谷", fare: "約 ¥260（Metro）" },
        { name: "新宿", fare: "約 ¥230~260" },
        { name: "東京車站", fare: "約 ¥180~210" },
        { name: "淺草雷門", fare: "約 ¥210~300" },
        { name: "秋葉原", fare: "約 ¥180~210" },
        { name: "成田機場", fare: "約 ¥1,200~1,700" },
    ];
    const hasHotelFareBasis = isHotelOrKinshichoOrigin(origin);

    // Google Maps 深度連結（按鈕開啟完整導航）
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=transit`;

    // 從行程中取得所有地點，按天分組
    const itinerarySource = Object.keys(itinerary || {}).length > 0 ? itinerary : DEFAULT_ITINERARY;
    const itineraryPlaces = Object.entries(itinerarySource).map(([dayKey, dayPlan]) => {
        const places = dayPlan.activities
            .map(a => a.name)
            .filter(name => name && !name.includes("飯店") && !name.includes("回") && !name.includes("休息") && !name.includes("收拾"));
        return { dayKey, title: dayPlan.title, date: dayPlan.date, places };
    }).filter(d => d.places.length > 0);

    return (
        <section id="routemap" className="py-4 md:py-12 transition-colors duration-300 scroll-mt-28">
            <div className="text-center mb-8 md:mb-12">
                <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Internal Transit System</div>
                <h2 className="text-3xl md:text-5xl font-black mb-3">🗺️ 智慧交通規劃</h2>
                <p className="text-gray-600 dark:text-gray-400 text-sm md:text-base px-2">一站式查詢轉乘路線，並預覽行程所需車資</p>
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
                                    <label htmlFor="route-origin" className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">起點</label>
                                    <div className="absolute left-4 top-[44px] text-gray-400"><MapPin className="w-4 h-4" /></div>
                                    <input
                                        id="route-origin"
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
                                        aria-label="交換起點與目的地"
                                        className="w-11 h-11 inline-flex items-center justify-center bg-white dark:bg-slate-800 border-2 border-gray-100 dark:border-slate-700 hover:text-primary rounded-full transition-all shadow-md active:scale-90"
                                    >
                                        <ArrowRightLeft className="w-4 h-4 rotate-90" />
                                    </button>
                                </div>

                                <div className="relative group">
                                    <label htmlFor="route-destination" className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-2 ml-1">目的地</label>
                                    <div className="absolute left-4 top-[44px] text-gray-400"><Search className="w-4 h-4" /></div>
                                    <input
                                        id="route-destination"
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
                                        <span className="text-xs text-gray-400 font-bold italic">
                                            {hasHotelFareBasis ? spot.fare : "車資依路線"}
                                        </span>
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
                                                            className="min-h-11 text-xs bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl font-bold border border-gray-100 dark:border-slate-700 hover:border-primary hover:text-primary transition-all"
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
                        <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden flex flex-col">
                            <div className="p-6 bg-gray-50 dark:bg-slate-900 border-b border-gray-100 dark:border-slate-800 flex justify-between items-center shrink-0">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="bg-primary/10 p-2 rounded-xl text-primary shrink-0"><MapIcon className="w-5 h-5" /></div>
                                    <div className="min-w-0">
                                        <p className="font-black text-base truncate">{origin} → {destination}</p>
                                        <p className="text-sm text-gray-400 font-bold uppercase tracking-wider">Transit Directions</p>
                                    </div>
                                </div>
                                <button onClick={() => setIsSearched(false)} aria-label="關閉路線結果" className="w-11 h-11 inline-flex items-center justify-center hover:bg-gray-200 dark:hover:bg-slate-700 rounded-full shrink-0 ml-2"><X className="w-4 h-4" /></button>
                            </div>

                            <div className="relative bg-slate-100 w-full" style={{ height: "450px" }}>
                                <RouteMapView originName={origin} destName={destination} />
                            </div>

                            <div className="p-6 md:p-8 bg-gray-50 dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 shrink-0">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                                    <div className="flex items-start gap-4">
                                        <div className="bg-orange-500/10 p-3 rounded-2xl text-orange-500 shrink-0">
                                            <Wallet className="w-6 h-6" />
                                        </div>
                                        <div>
                                            <h5 className="font-black text-base mb-1 text-orange-600 uppercase tracking-widest">車資預估</h5>
                                            <p className="text-sm text-gray-500 leading-relaxed font-bold">
                                                {(() => {
                                                    if (!hasHotelFareBasis) {
                                                        return <>
                                                            自訂起點車資 <span className="text-primary font-black">依路線而定</span>，請查看即時路線結果
                                                        </>;
                                                    }
                                                    const matched = quickSpots.find(s => destination.includes(s.name));
                                                    if (matched) return <>預估車資 <span className="text-primary font-black">{matched.fare}</span></>;
                                                    return <>一般電車單程約 <span className="text-primary font-black">¥180 ~ ¥430</span>，實際票價依路線而定</>;
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
                <div className="space-y-8 max-w-4xl mx-auto animate-in fade-in duration-1000">
                    {/* 常用車資參考表 */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-800 rounded-[2rem] p-6 border border-blue-100 dark:border-slate-700">
                        <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-primary" />
                            常用車資參考（從飯店出發）
                        </h3>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                            {[
                                { from: "錦糸町", to: "澀谷", fare: "約 ¥260（Metro）", color: "text-blue-600" },
                                { from: "錦糸町", to: "新宿", fare: "約 ¥230~260", color: "text-blue-600" },
                                { from: "錦糸町", to: "淺草", fare: "約 ¥210~300", color: "text-green-600" },
                                { from: "淺草", to: "晴空塔", fare: "約 ¥180~220", color: "text-green-600" },
                                { from: "押上", to: "淺草", fare: "約 ¥180", color: "text-green-600" },
                            ].map((f, i) => (
                                <div key={i} className="bg-white dark:bg-slate-900 rounded-xl p-3 text-center shadow-sm">
                                    <div className="text-xs text-gray-400 font-bold mb-1">{f.from} → {f.to}</div>
                                    <div className={`font-black text-sm ${f.color}`}>{f.fare}</div>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-100 dark:border-amber-800">
                            <p className="text-sm text-amber-700 dark:text-amber-300 font-bold leading-relaxed">
                                💡 Tokyo Subway Ticket：24h ¥1,000／48h ¥1,500／72h ¥2,000。
                                官方估算 24h 約搭 6 次才一定划算；請依行程逐段試算，且不適用 JR。{" "}
                                <a
                                    href="https://www.tokyometro.jp/tst/tcn/index.html"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-11 items-center px-1 underline underline-offset-2"
                                >
                                    官方票券說明
                                </a>
                            </p>
                        </div>
                    </div>

                    {/* IC 卡指南 */}
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] p-6 md:p-8 shadow-lg border border-gray-100 dark:border-slate-700">
                        <h3 className="text-xl font-black mb-6 flex items-center gap-2">
                            <CreditCard className="w-6 h-6 text-primary" />
                            IC 卡使用指南
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-2xl">💳</span>
                                    <h3 className="font-black text-lg text-blue-600 dark:text-blue-400">Suica（推薦首都圈）</h3>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2">
                                    可用於支援交通 IC 的東京 Metro、都營地鐵、JR 東日本路線，以及便利商店、自動販賣機
                                </p>
                                <p className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-white/60 dark:bg-transparent px-2 py-1 rounded-lg inline-block">
                                    💡 建議首次儲值 ¥5,000
                                </p>
                            </div>
                            <div className="bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800 rounded-2xl p-5">
                                <div className="flex items-center gap-3 mb-3">
                                    <span className="text-2xl">📱</span>
                                    <h3 className="font-black text-lg text-green-600 dark:text-green-400">手機 Suica（裝置有限制）</h3>
                                </div>
                                <p className="text-sm text-gray-600 dark:text-gray-300 leading-relaxed mb-2">
                                    Apple Pay 相容 iPhone 可用 Welcome Suica Mobile，並以 Apple Pay 信用卡手動加值。
                                    海外版 Android 目前通常無法發行 Suica；建議改用實體 Welcome Suica。
                                </p>
                                <div className="text-xs font-bold text-green-700 dark:text-green-400 bg-white/60 dark:bg-transparent px-2 py-1 rounded-lg inline-block leading-relaxed">
                                    一般信用卡不是自動加值；自動加值須符合日本 View Card 等資格。{" "}
                                    <a
                                        href="https://www.jreast.co.jp/multi/welcomesuicamobile/"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex min-h-11 items-center px-1 underline underline-offset-2"
                                    >
                                        JR 東日本說明
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* 使用提示 */}
                    <div className="bg-blue-50/50 dark:bg-blue-900/10 p-6 rounded-[2rem] border border-blue-100 dark:border-blue-900/30">
                        <div className="flex items-center gap-3 mb-4">
                            <Info className="w-6 h-6 text-blue-500" />
                            <h3 className="text-xl font-black text-blue-600">使用提示</h3>
                        </div>
                        <ul className="text-sm text-blue-500/80 space-y-2 font-bold leading-relaxed">
                            <li>• 輸入起點與目的地即可在頁面內預覽路線規劃</li>
                            <li>• 點擊快速標籤可預覽常用景點車資</li>
                            <li>• 展開「依行程查詢路線」可快速查看各景點交通</li>
                        </ul>
                    </div>
                </div>
            )}
        </section>
    );
}
