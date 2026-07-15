import { AlertCircle, Lightbulb, Zap, Info, ShieldCheck, Coffee, Umbrella } from "lucide-react";

export function Tips() {
  const tips = [
    { title: "現金很重要", desc: "日本許多名店仍只收現金。建議多換一些日幣，便利商店 ATM 亦可提領。", icon: <ShieldCheck className="w-5 h-5 text-primary" /> },
    { title: "網路連線", desc: "建議使用 eSIM 或實體 SIM 卡。各大車站、便利商店也有免費 Wi-Fi 覆蓋。", icon: <Zap className="w-5 h-5 text-blue-500" /> },
    { title: "穿著建議", desc: "9月東京依然炎熱且偶有雷雨。建議穿著透氣衣物並隨身攜帶輕便摺疊傘。", icon: <Umbrella className="w-5 h-5 text-accent" /> },
    { title: "垃圾處理", desc: "日本街頭垃圾桶極少。建議隨身攜帶小塑膠袋，或在便利商店定點丟棄。", icon: <AlertCircle className="w-5 h-5 text-green-500" /> },
    { title: "電車禮儀", desc: "車廂內請將手機轉為靜音並避免通話；列車擁擠時，也請留意博愛座附近的廣播提醒。", icon: <Info className="w-5 h-5 text-indigo-500" /> },
    { title: "便利商店", desc: "7-11、全家是你的補給站。可購買票券、領錢、寄放包裹，功能非常齊全。", icon: <Coffee className="w-5 h-5 text-orange-500" /> },
  ];

  return (
    <section id="tips" className="py-4 md:py-9 max-w-6xl mx-auto animate-in fade-in duration-700 scroll-mt-28">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-3"><Lightbulb className="h-4 w-4" />Travel Smarter</div>
          <h2 className="text-2xl md:text-3xl font-black">旅途中真正用得到的細節</h2>
        </div>
        <p className="max-w-md text-sm leading-relaxed text-gray-600 dark:text-gray-300 sm:text-right">先記住六件小事，現場少一次手忙腳亂。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
        {tips.map((tip, i) => (
          <article key={tip.title} className="trip-card group relative overflow-hidden bg-white dark:bg-slate-800 p-5 rounded-[1.6rem] border border-gray-100 dark:border-slate-700 transition-transform duration-300 hover:-translate-y-0.5">
            <span className="absolute right-4 top-2 font-metric text-4xl font-bold text-gray-900/[0.04] dark:text-white/[0.05]" aria-hidden="true">0{i + 1}</span>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-gray-50 dark:bg-slate-900 p-2.5 rounded-xl">
                {tip.icon}
              </div>
              <h3 className="font-black text-lg text-gray-900 dark:text-white">{tip.title}</h3>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
              {tip.desc}
            </p>
          </article>
        ))}
      </div>

      <aside className="mt-5 bg-[#101c2d] text-white p-6 md:p-8 rounded-[2rem] relative overflow-hidden shadow-xl">
        <div className="absolute top-0 right-0 w-64 h-64 bg-primary opacity-10 blur-[100px]"></div>
        <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left space-y-2">
            <h3 className="text-2xl font-black flex items-center justify-center md:justify-start gap-3">
              <Lightbulb className="text-amber-300 w-6 h-6" /> 出發前 24 小時
            </h3>
            <p className="text-gray-400 text-base max-w-md font-medium">
              更新一次離線旅行包、確認 eSIM 可用，再把飯店日文地址截圖；地下鐵沒訊號時會很有用。
            </p>
          </div>
          <div className="font-metric bg-white/10 px-5 py-3 rounded-2xl border border-white/10 text-xs font-black tracking-[0.18em]">
            READY / OFFLINE
          </div>
        </div>
      </aside>
    </section>
  );
}
