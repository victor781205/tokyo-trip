"use client";

import { useState, useEffect } from "react";
import { useTheme } from "next-themes";
import { Menu, X, Moon, Sun, Home, Share2, Check, Settings } from "lucide-react";
import { useTrip } from "@/context/TripContext";

export const NAV_LINKS = [
  { id: "hero", label: "首頁" },
  { id: "flights", label: "機票" },
  { id: "transfer", label: "交通" },
  { id: "hotel", label: "住宿" },
  { id: "routemap", label: "路線" },
  { id: "weather", label: "天氣" },
  { id: "itinerary", label: "行程" },
  { id: "tools", label: "預算" },
  { id: "food", label: "美食" },
  { id: "tips", label: "實用" },
];

interface NavigationProps {
  activeTab: string;
  setActiveTab: (id: string) => void;
}

export function Navigation({ activeTab, setActiveTab }: NavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const { tripId, tripSecret, loginToTrip, getShareLink } = useTrip();
  
  const [inputTripId, setInputTripId] = useState("");
  const [inputSecret, setInputSecret] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const mountTimer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(mountTimer);
  }, []);

  const toggleTheme = () => {
    const currentTheme = theme === 'system' ? systemTheme : theme;
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  };

  

  const handleShare = () => {
    const link = getShareLink();
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputTripId || !inputSecret) return;
    setLoading(true);
    const success = await loginToTrip(inputTripId, inputSecret);
    setLoading(false);
    if (success) {
        setShowSyncModal(false);
    }
  };

  return (
    <>
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-gray-100 dark:border-slate-800 transition-all duration-300 safe-top">
        <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
            <button 
                onClick={() => setActiveTab("hero")}
                className="text-2xl font-black text-primary hover:scale-105 transition-transform flex items-center gap-2"
            >
                🗼 <span className="hidden sm:inline">東京自由行</span>
            </button>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-2">
                {NAV_LINKS.map((link) => (
                    <button
                    key={link.id}
                    onClick={() => setActiveTab(link.id)}
                    className={`text-sm font-black px-4 py-2 rounded-2xl transition-all duration-300 ${
                        activeTab === link.id
                        ? "bg-primary text-white shadow-lg shadow-primary/30 scale-105"
                        : "text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800"
                    }`}
                    >
                    {link.label}
                    </button>
                ))}

                <div className="w-px h-6 bg-gray-200 dark:bg-slate-700 mx-2" />

                <button
                    onClick={() => { setInputTripId(tripId); setInputSecret(tripSecret); setShowSyncModal(true); }}
                    className="p-2.5 bg-gray-100 dark:bg-slate-800 rounded-2xl text-gray-500 hover:text-primary transition-all active:scale-90"
                >
                    <Settings className="w-5 h-5" />
                </button>

                <button onClick={toggleTheme} className="p-2.5 bg-gray-100 dark:bg-slate-800 rounded-2xl transition-all active:scale-90 ml-1">
                    {mounted && (theme === "dark" || (theme === "system" && systemTheme === "dark")) ? <Sun className="w-5 h-5 text-accent" /> : <Moon className="w-5 h-5 text-slate-700" />}
                </button>
            </div>

            {/* Mobile Nav Controls - Enhanced for Flagships */}
            <div className="flex lg:hidden items-center gap-1">
                <button onClick={() => setShowSyncModal(true)} className="p-3 text-gray-400 active:bg-gray-100 dark:active:bg-slate-800 rounded-2xl transition-colors">
                    <Settings className="w-6 h-6" />
                </button>
                <button onClick={toggleTheme} className="p-3 text-gray-400 active:bg-gray-100 dark:active:bg-slate-800 rounded-2xl transition-colors">
                    {mounted && (theme === "dark" || (theme === "system" && systemTheme === "dark")) ? <Sun className="w-6 h-6 text-accent" /> : <Moon className="w-6 h-6 text-slate-700" />}
                </button>
                <button onClick={() => setIsOpen(!isOpen)} className="p-3 text-primary bg-primary/5 rounded-2xl ml-1 active:scale-90 transition-all">
                    {isOpen ? <X className="w-7 h-7" /> : <Menu className="w-7 h-7" />}
                </button>
            </div>
        </div>
      </nav>

      {/* Flagship-Friendly Fullscreen Menu */}
      {isOpen && (
        <div className="fixed inset-0 z-40 bg-white dark:bg-slate-900 lg:hidden animate-in fade-in duration-300">
          <div className="h-full flex flex-col pt-24 px-6 pb-12 overflow-y-auto">
            <div className="grid grid-cols-2 gap-4">
                {NAV_LINKS.map((link) => (
                <button
                    key={link.id}
                    onClick={() => { setActiveTab(link.id); setIsOpen(false); }}
                    className={`h-32 rounded-[2.5rem] border-2 transition-all flex flex-col items-center justify-center gap-3 ${
                    activeTab === link.id 
                        ? "bg-primary border-primary text-white shadow-2xl shadow-primary/30 scale-105" 
                        : "bg-gray-50 dark:bg-slate-800 border-transparent text-gray-700 dark:text-gray-300 active:scale-95"
                    }`}
                >
                    <div className={activeTab === link.id ? "text-white" : "text-primary"}>
                        {link.id === "hero" && <Home className="w-8 h-8" />}
                        {link.id !== "hero" && <span className="text-3xl">🗼</span>}
                    </div>
                    <span className="text-xl font-black">{link.label}</span>
                </button>
                ))}
            </div>
            
            <div className="mt-auto pt-10">
                <button onClick={handleShare} className="w-full py-6 rounded-[2rem] bg-gray-900 text-white font-black flex items-center justify-center gap-3 shadow-xl active:scale-95 transition-all">
                    {copied ? <Check className="w-6 h-6 text-green-400" /> : <Share2 className="w-6 h-6" />}
                    {copied ? "已成功複製連結" : "同步分享此行程"}
                </button>
            </div>
          </div>
        </div>
      )}

      {/* Modern Sync Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-300">
           <div className="bg-white dark:bg-slate-800 w-full max-w-md rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 slide-in-from-bottom-10 duration-300 border border-white/10">
              <div className="p-8 bg-gradient-to-br from-indigo-600 via-blue-600 to-indigo-700 text-white relative">
                 <h3 className="text-3xl font-black mb-1">同步設定</h3>
                 <p className="text-blue-100 text-sm opacity-70">Cross-Device Synchronization</p>
                 <button onClick={() => setShowSyncModal(false)} className="absolute top-8 right-8 p-2 bg-white/10 hover:bg-white/20 rounded-full transition-colors"><X className="w-6 h-6"/></button>
              </div>
              
              <div className="p-8 space-y-8">
                 <div>
                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest block mb-4 ml-1">您的專屬代號</label>
                    <div className="bg-gray-50 dark:bg-slate-900 p-5 rounded-[2rem] border border-gray-100 dark:border-slate-800">
                       <div className="flex justify-between items-center mb-4">
                          <span className="text-sm text-gray-500 font-bold uppercase">Trip ID</span>
                          <span className="font-mono font-black text-primary bg-primary/5 px-3 py-1 rounded-lg">{tripId}</span>
                       </div>
                       <button 
                         onClick={handleShare}
                         className={`w-full py-4 rounded-2xl font-black text-base transition-all flex items-center justify-center gap-3 ${
                            copied ? "bg-green-500 text-white" : "bg-white dark:bg-slate-800 text-gray-900 dark:text-white border border-gray-200 dark:border-slate-700 shadow-sm active:scale-95"
                         }`}
                       >
                         {copied ? <Check className="w-5 h-5" /> : <Share2 className="w-5 h-5" />}
                         {copied ? "連結已複製" : "複製分享連結"}
                       </button>
                    </div>
                 </div>

                 <div className="space-y-4">
                    <label className="text-sm font-black text-gray-400 uppercase tracking-widest block ml-1">登入其他行程</label>
                    <form onSubmit={handleLogin} className="space-y-3">
                       <input 
                         type="text" 
                         placeholder="輸入行程代號" 
                         value={inputTripId}
                         onChange={e => setInputTripId(e.target.value)}
                         className="w-full p-5 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-mono text-base"
                       />
                       <input 
                         type="password" 
                         placeholder="輸入同步密碼" 
                         value={inputSecret}
                         onChange={e => setInputSecret(e.target.value)}
                         className="w-full p-5 rounded-2xl border-2 border-gray-50 dark:border-slate-700 bg-gray-50 dark:bg-slate-900 focus:border-primary focus:outline-none transition-all font-mono text-base"
                       />
                       <button 
                         disabled={loading}
                         className="w-full py-5 bg-primary hover:bg-primary-dark text-white rounded-2xl font-black shadow-xl shadow-primary/20 transition-all active:scale-95"
                       >
                         {loading ? "正在同步資料..." : "立即確認同步"}
                       </button>
                    </form>
                 </div>
              </div>
           </div>
        </div>
      )}
    </>
  );
}
