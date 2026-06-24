import { AlertCircle, Lightbulb, Zap, Info, ShieldCheck, Coffee, Umbrella } from "lucide-react";

export function Tips() {
  const tips = [
    { title: "現金很重要", desc: "日本許多名店仍只收現金。建議多換一些日幣，便利商店 ATM 亦可提領。", icon: <ShieldCheck className="w-5 h-5 text-primary" /> },
    { title: "網路連線", desc: "建議租借 eSIM 或實體卡。各大車站、便利商店皆有免費 Wi-Fi 覆寫。", icon: <Zap className="w-5 h-5 text-blue-500" /> },
    { title: "穿著建議", desc: "9月東京依然炎熱且偶有雷雨。建議穿著透氣衣物並隨身攜帶輕便摺疊傘。", icon: <Umbrella className="w-5 h-5 text-accent" /> },
    { title: "垃圾處理", desc: "日本街頭垃圾桶極少。建議隨身攜帶小塑膠袋，或在便利商店定點丟棄。", icon: <AlertCircle className="w-5 h-5 text-green-500" /> },
    { title: "電車禮儀", desc: "車廂內請將手機轉為靜音並避免通話。博愛座附近應儘量關閉手機電源。", icon: <Info className="w-5 h-5 text-indigo-500" /> },
    { title: "便利商店", desc: "7-11、全家是你的補給站。可購買票券、領錢、寄放包裹，功能非常齊全。", icon: <Coffee className="w-5 h-5 text-orange-500" /> },
  ];

  return (
    <section id="tips" className="py-8 px-4 md:px-12 max-w-6xl mx-auto animate-in fade-in duration-700">
      <div className="text-center mb-12">
        <div className="inline-block bg-primary/10 text-primary px-4 py-1 rounded-full text-sm font-black uppercase tracking-widest mb-4">Travel Smarter</div>
        <h2 className="text-3xl md:text-5xl font-black mb-4">📝 旅遊小提醒</h2>
        <p className="text-gray-500 max-w-lg mx-auto font-medium">這些在地細節能讓您的旅程更加順心、優雅。</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
        {tips.map((tip, i) => (
          <div key={i} className="bg-white dark:bg-slate-800 p-6 rounded-[2rem] shadow-xl border border-gray-100 dark:border-slate-700 hover:shadow-2xl transition-all duration-300 group">
            <div className="flex items-center gap-4 mb-4">
              <div className="bg-gray-50 dark:bg-slate-900 p-3 rounded-2xl group-hover:scale-110 transition-transform shadow-inner">
                {tip.icon}
              </div>
              <h4 className="font-black text-xl text-gray-900 dark:text-white uppercase tracking-tighter">{tip.title}</h4>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed font-medium">
              {tip.desc}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-16 bg-gray-900 text-white p-8 md:p-12 rounded-[3rem] relative overflow-hidden shadow-2xl">
         <div className="absolute top-0 right-0 w-64 h-64 bg-primary opacity-10 blur-[100px]"></div>
         <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="text-center md:text-left space-y-2">
                <h4 className="text-3xl font-black italic flex items-center justify-center md:justify-start gap-3">
                    <Lightbulb className="text-accent fill-accent w-6 h-6" /> Pro Tip!
                </h4>
                <p className="text-gray-400 text-base max-w-md font-medium">
                    將此網站加入您的手機主畫面 (Add to Home Screen)，即使在沒訊號的地下鐵中也能快速查看已同步的行程！
                </p>
            </div>
            <div className="bg-white/10 p-4 rounded-3xl backdrop-blur-xl border border-white/10 text-sm font-black uppercase tracking-[0.2em]">
                PWA Enabled
            </div>
         </div>
      </div>
    </section>
  );
}
