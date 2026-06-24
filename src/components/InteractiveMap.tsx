"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Navigation, Eye, X, MapPin } from "lucide-react";

export function InteractiveMap() {
  const [scale, setScale] = useState(1);
  const [selectedSpot, setSelectedSpot] = useState<typeof spots[0] | null>(null);

  const zoom = (factor: number) => {
    setScale(prev => Math.max(0.5, Math.min(3, prev * factor)));
  };

  const spots = [
    { id: "hotel", name: "錦糸町 (飯店)", x: 550, y: 150, color: "#e74c3c", info: "東武黎凡特飯店所在地，生活機能優越，可遠眺晴空塔。", tags: ["住宿", "交通樞紐"], image: "🏨" },
    { id: "asakusa", name: "淺草寺", x: 480, y: 120, color: "#f39c12", info: "東京最古老的寺廟，必看雷門、仲見世通。", tags: ["景點", "傳統文化"], image: "⛩️" },
    { id: "shibuya", name: "澀谷", x: 150, y: 300, color: "#3498db", info: "十字路口、109百貨、SHIBUYA SKY 展望台。", tags: ["購物", "夜景"], image: "🐕" },
    { id: "shinjuku", name: "新宿", x: 150, y: 200, color: "#9b51e0", info: "全球最繁忙車站，新宿御苑、思出橫丁。", tags: ["交通", "美食"], image: "🛍️" },
    { id: "akiba", name: "秋葉原", x: 400, y: 160, color: "#2ecc71", info: "動漫天堂、電器街、女僕咖啡廳。", tags: ["動漫", "電器"], image: "🎮" },
    { id: "toyosu", name: "豐洲/台場", x: 500, y: 380, color: "#1abc9c", info: "豐洲市場新鮮海鮮、teamLab、彩虹大橋。", tags: ["美食", "數位藝術"], image: "🌊" },
    { id: "ueno", name: "上野", x: 420, y: 100, color: "#e67e22", info: "阿美橫丁、上野公園、多間博物館。", tags: ["採買", "文化"], image: "🐼" },
  ];

  return (
    <section id="map" className="py-20 px-6 md:px-12 max-w-7xl mx-auto transition-colors duration-300">
      <div className="text-center mb-16">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Location Explorer</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">📍 互動景點探索</h2>
        <p className="text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          點擊地圖上的標記查看景點詳細資訊，系統已為您標註本次行程的所有關鍵地點。
        </p>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
         {/* Map Window */}
         <div className="flex-1 bg-white dark:bg-slate-800 rounded-[3rem] shadow-2xl border border-gray-100 dark:border-slate-700 overflow-hidden relative group h-[600px]">
            {/* Controls */}
            <div className="absolute top-6 left-6 z-10 flex flex-col gap-2">
              <button onClick={() => zoom(1.2)} className="p-3 bg-white/90 dark:bg-slate-700/90 backdrop-blur rounded-2xl shadow-xl hover:text-primary transition-all active:scale-95"><ZoomIn className="w-5 h-5"/></button>
              <button onClick={() => zoom(0.8)} className="p-3 bg-white/90 dark:bg-slate-700/90 backdrop-blur rounded-2xl shadow-xl hover:text-primary transition-all active:scale-95"><ZoomOut className="w-5 h-5"/></button>
              <button onClick={() => setScale(1)} className="p-3 bg-white/90 dark:bg-slate-700/90 backdrop-blur rounded-2xl shadow-xl hover:text-primary transition-all active:scale-95"><RotateCcw className="w-5 h-5"/></button>
            </div>

            {/* SVG Map */}
            <div className="w-full h-full bg-[#f0f9ff] dark:bg-slate-900 cursor-grab active:cursor-grabbing relative overflow-hidden">
              <svg 
                viewBox="0 0 800 500" 
                className="w-full h-full transition-transform duration-500 ease-out origin-center"
                style={{ transform: `scale(${scale})` }}
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur in="SourceAlpha" stdDeviation="3" />
                    <feOffset dx="0" dy="2" result="offsetblur" />
                    <feComponentTransfer><feFuncA type="linear" slope="0.3"/></feComponentTransfer>
                    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
                  </filter>
                </defs>

                {/* Water */}
                <path d="M0,380 Q150,350 300,380 Q450,410 600,370 Q750,340 800,360 L800,500 L0,500 Z" fill="#bae6fd" className="dark:fill-slate-800 transition-colors" />
                
                {/* Roads/Grid */}
                <g stroke="currentColor" strokeWidth="1" opacity="0.1" className="text-gray-400">
                  <line x1="0" y1="100" x2="800" y2="100" />
                  <line x1="0" y1="200" x2="800" y2="200" />
                  <line x1="0" y1="300" x2="800" y2="300" />
                  <line x1="200" y1="0" x2="200" y2="500" />
                  <line x1="400" y1="0" x2="400" y2="500" />
                  <line x1="600" y1="0" x2="600" y2="500" />
                </g>

                {/* JR Lines */}
                <path d="M150,300 L150,200 L400,160 L550,150" stroke="#ffd33b" strokeWidth="8" fill="none" strokeLinecap="round" opacity="0.3" />
                <circle cx="150" cy="300" r="4" fill="#ffd33b" />
                <circle cx="150" cy="200" r="4" fill="#ffd33b" />
                <circle cx="400" cy="160" r="4" fill="#ffd33b" />
                <circle cx="550" cy="150" r="4" fill="#ffd33b" />

                {/* Markers */}
                {spots.map((spot) => (
                  <g 
                    key={spot.id} 
                    className="cursor-pointer transition-all duration-300"
                    onClick={() => setSelectedSpot(spot)}
                  >
                    <circle cx={spot.x} cy={spot.y} r="25" fill={spot.color} opacity="0" className="hover:opacity-10" />
                    
                    {/* Pin Shape */}
                    <path 
                      d={`M${spot.x},${spot.y} c-5-5 -10-12 -10-18 a10,10 0 1,1 20,0 c0,6 -5,13 -10,18 z`} 
                      fill={spot.color} 
                      filter="url(#shadow)"
                      className={`transition-transform duration-300 ${selectedSpot?.id === spot.id ? 'scale-150' : 'hover:scale-125'}`}
                    />
                    <circle cx={spot.x} cy={spot.y - 18} r="4" fill="white" />
                    
                    <text 
                      x={spot.x} 
                      y={spot.y + 25} 
                      textAnchor="middle" 
                      className={`text-base font-black pointer-events-none select-none transition-colors ${selectedSpot?.id === spot.id ? 'fill-primary' : 'fill-gray-500 dark:fill-gray-400'}`}
                    >
                      {spot.name}
                    </text>
                  </g>
                ))}
              </svg>
            </div>
         </div>

         {/* Info Sidebar */}
         <div className="w-full lg:w-96 space-y-6">
            <div className={`h-full bg-white dark:bg-slate-800 rounded-[2.5rem] p-8 shadow-xl border border-gray-100 dark:border-slate-700 transition-all duration-500 ${selectedSpot ? 'opacity-100 translate-x-0' : 'opacity-60 grayscale'}`}>
               {selectedSpot ? (
                 <div className="animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex justify-between items-start mb-6">
                       <div className="text-5xl bg-gray-50 dark:bg-slate-900 w-20 h-20 flex items-center justify-center rounded-3xl shadow-inner border border-gray-100 dark:border-slate-800">
                          {selectedSpot.image}
                       </div>
                       <button onClick={() => setSelectedSpot(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full">
                          <X className="w-5 h-5 text-gray-400" />
                       </button>
                    </div>
                    
                    <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-2">{selectedSpot.name}</h3>
                    
                    <div className="flex flex-wrap gap-2 mb-6">
                       {selectedSpot.tags.map(t => (
                         <span key={t} className="text-sm font-bold bg-primary/10 text-primary px-2 py-1 rounded-md uppercase tracking-wider">{t}</span>
                       ))}
                    </div>

                    <p className="text-gray-600 dark:text-gray-300 leading-relaxed mb-8">
                       {selectedSpot.info}
                    </p>

                    <div className="space-y-4">
                       <button className="w-full py-4 bg-primary hover:bg-primary-dark text-white rounded-2xl font-bold shadow-lg shadow-primary/20 transition-all flex items-center justify-center gap-2">
                          <Navigation className="w-4 h-4" /> 開始導航
                       </button>
                       <button className="w-full py-4 bg-gray-50 dark:bg-slate-900 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-2xl font-bold text-gray-600 dark:text-gray-300 transition-all flex items-center justify-center gap-2 border border-gray-100 dark:border-slate-800">
                          <Eye className="w-4 h-4" /> 查看實景
                       </button>
                    </div>
                 </div>
               ) : (
                 <div className="h-full flex flex-col items-center justify-center text-center py-20">
                    <MapPin className="w-16 h-16 text-gray-200 dark:text-slate-700 mb-6" />
                    <h4 className="text-2xl font-bold text-gray-400 mb-2">選取景點標籤</h4>
                    <p className="text-base text-gray-400">點擊地圖上的圖示查看<br/>更詳細的旅遊資訊與功能</p>
                 </div>
               )}
            </div>
         </div>
      </div>
    </section>
  );
}
