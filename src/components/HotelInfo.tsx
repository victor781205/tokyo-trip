"use client";

import { MapPin, Train, Globe, CheckCircle2, Plane, Navigation, ExternalLink, Clock3 } from "lucide-react";

const HOTEL_GOOGLE_URL = "https://www.google.com/maps/dir/?api=1&origin=Narita+Airport+NRT&destination=Tobu+Levant+Hotel+Tokyo+Kinshicho";

const transferMethods = [
  {
    icon: "🚌",
    title: "利木津巴士",
    subtitle: "直達飯店門口",
    duration: "官方約 120 分鐘",
    fare: "約 ¥3,100",
    badge: "最輕鬆",
    badgeBg: "bg-orange-100 text-orange-700",
    badgeBorder: "border-orange-200",
    description: "直達飯店；例：T2 14:30 發車、16:10 抵達，須預留交通浮動",
    recommended: false,
  },
  {
    icon: "🚃",
    title: "JR 總武線直達",
    subtitle: "CP 值最高",
    duration: "官方約 85 分鐘",
    fare: "依 JR 當日票價",
    badge: "最划算",
    badgeBg: "bg-blue-100 text-blue-700",
    badgeBorder: "border-blue-200",
    description: "JR 成田線快速直達錦糸町站，一車到底",
    recommended: true,
  },
  {
    icon: "⚡",
    title: "京成 Access 特快",
    subtitle: "速度最快",
    duration: "約 65~75 分鐘",
    fare: "約 ¥1,350",
    badge: "最快速",
    badgeBg: "bg-green-100 text-green-700",
    badgeBorder: "border-green-200",
    description: "京成線至押上站轉乘半藏門線，班次密集",
    recommended: false,
  },
  {
    icon: "🚀",
    title: "Skyliner + JR 線",
    subtitle: "舒適度最高",
    duration: "約 65 分鐘",
    fare: "約 ¥2,800+",
    badge: "最舒適",
    badgeBg: "bg-purple-100 text-purple-700",
    badgeBorder: "border-purple-200",
    description: "對號座位、行李置放架，適合追求舒適",
    recommended: false,
  },
];

const arrivalSteps = [
  { time: "12:55", label: "抵達成田機場", sub: "JX800 降落" },
  { time: "14:00~", label: "入境與領行李", sub: "依現場人流調整" },
  { time: "14:30~", label: "前往錦糸町", sub: "依入境與班次選車" },
  { time: "16:10~", label: "抵達飯店", sub: "寄放行李／Check-in" },
  { time: "17:00~", label: "彈性開始遊玩", sub: "延誤時直接順延" },
];

export function HotelInfo() {
  return (
    <section id="hotel" className="py-6 md:py-12 scroll-mt-28">
      {/* ── 頁面抬頭 ── */}
      <div className="text-center mb-8">
        <h2 className="text-3xl md:text-4xl font-black mb-2">🏨 住宿與交通</h2>
        <p className="text-gray-500 font-bold">Day 1 抵達資訊 · 機場接駁</p>
      </div>

      {/* ═══════════════════════════════
          第一區：飯店資訊 + Day 1 時間線
      ═══════════════════════════════ */}
      <div className="bg-white dark:bg-slate-800 rounded-[2.5rem] shadow-xl overflow-hidden border border-gray-100 dark:border-slate-700 mb-6">
        <div className="p-6 md:p-8">
          {/* 飯店抬頭 */}
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div>
              <h3 className="text-2xl font-extrabold text-primary">東京東武黎凡特飯店</h3>
              <p className="text-sm text-gray-400 font-bold">Tobu Levant Hotel Tokyo</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <a
                href="https://tc.tobuhotel.co.jp/levant/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 bg-primary hover:bg-primary-dark text-white px-4 py-2 rounded-xl font-bold transition-all text-sm"
              >
                <Globe className="w-4 h-4" /> 官方網站
              </a>
              <a
                href={HOTEL_GOOGLE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-1.5 bg-gray-100 dark:bg-slate-700 hover:bg-gray-200 dark:hover:bg-slate-600 text-gray-700 dark:text-gray-200 px-4 py-2 rounded-xl font-bold transition-all text-sm"
              >
                <ExternalLink className="w-4 h-4" /> 地圖
              </a>
            </div>
          </div>

          {/* 飯店資訊網格 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-black text-gray-400 uppercase tracking-wider mb-0.5">地址</div>
                <div className="font-bold text-sm text-gray-700 dark:text-gray-200">墨田區錦糸 1-2-2</div>
                <div className="text-xs text-gray-400">130-0013</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Train className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-xs font-black text-gray-400 uppercase tracking-wider mb-0.5">交通</div>
                <div className="font-bold text-sm text-gray-700 dark:text-gray-200">JR 總武線「錦糸町」站</div>
                <div className="text-xs text-gray-400">北口步行約 3 分鐘</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              </div>
              <div>
                <div className="text-xs font-black text-gray-400 uppercase tracking-wider mb-0.5">特色</div>
                <div className="font-bold text-sm text-gray-700 dark:text-gray-200">JR／半藏門線交通便利</div>
                <div className="text-xs text-gray-400">前往東京、澀谷、押上方便</div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-orange-500/10 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                <Clock3 className="w-4 h-4 text-orange-500" />
              </div>
              <div>
                <div className="text-xs font-black text-gray-400 uppercase tracking-wider mb-0.5">標準退房</div>
                <div className="font-bold text-sm text-gray-700 dark:text-gray-200">11:00 前</div>
                <div className="text-xs text-gray-400">退房後可向櫃檯寄放行李</div>
              </div>
            </div>
          </div>

          {/* 設施標籤 */}
          <div className="flex flex-wrap gap-2 mb-6">
            {["📶 免費 Wi-Fi", "🍽️ 餐廳", "🚌 機場巴士停靠", "🧳 行李寄存", "🛁 客房浴缸"].map((f) => (
              <span key={f} className="bg-gray-50 dark:bg-slate-700/50 px-3 py-1.5 rounded-xl text-sm font-medium text-gray-600 dark:text-gray-300">
                {f}
              </span>
            ))}
          </div>

          {/* Day 1 抵達時間線 */}
          <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl p-5">
            <h3 className="font-black text-sm text-primary uppercase tracking-wider mb-1 flex items-center gap-2">
              <Plane className="w-4 h-4" /> Day 1 抵達時間線（估算）
            </h3>
            <p className="text-[11px] text-gray-500 mb-4">以 14:30 利木津巴士為例；入境、班次與路況皆可能變動。</p>

            <div className="relative">
              {/* 主軸線 */}
              <div className="absolute top-[5px] left-0 right-0 h-px bg-primary/25 mx-2"></div>

              {/* 時間點 */}
              <div className="relative flex justify-between">
                {arrivalSteps.map((step, i) => (
                  <div key={i} className="flex flex-col items-center text-center z-10" style={{ flex: "1 0 0" }}>
                    {/* 圓點 */}
                    <div
                      className={`w-2.5 h-2.5 rounded-full border-2 border-white dark:border-slate-900 mb-1.5 ${i === 4 ? "bg-green-500" : i === 0 ? "bg-blue-500" : "bg-primary"
                        }`}
                    ></div>
                    {/* 時間 */}
                    <div className="font-black text-xs text-primary leading-none mb-0.5 whitespace-nowrap">{step.time}</div>
                    {/* 標籤 */}
                    <div className="font-bold text-[10px] text-gray-700 dark:text-gray-200 leading-tight">{step.label}</div>
                    {/* 副標 */}
                    <div className="text-[9px] text-gray-400 leading-tight mt-0.5">{step.sub}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════
          第二區：機場 → 飯店 交通方式
      ═══════════════════════════════ */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-4">
          <Plane className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-black text-gray-900 dark:text-white">
            成田國際機場（NRT）→ 飯店
          </h3>
        </div>

        {/* 4 種交通方式 — 直接連結 Google Maps */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {transferMethods.map((t, i) => (
            <a
              key={i}
              href={`https://www.google.com/maps/dir/?api=1&origin=Narita+Airport+NRT&destination=Tobu+Levant+Hotel+Tokyo+Kinshicho&travelmode=transit`}
              target="_blank"
              rel="noopener noreferrer"
              className={`
                block bg-white dark:bg-slate-800 rounded-2xl p-5 border-2 transition-all
                hover:shadow-lg hover:-translate-y-0.5 cursor-pointer
                ${t.recommended
                  ? "border-primary shadow-primary/10 shadow-md"
                  : "border-gray-100 dark:border-slate-700 hover:border-gray-200 dark:hover:border-slate-600"
                }
              `}
            >
              <div className="flex items-start justify-between mb-2">
                <span className="text-3xl">{t.icon}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full font-black ${t.badgeBg}`}>
                  {t.badge}
                </span>
              </div>
              <div className="font-black text-gray-900 dark:text-white mb-0.5">{t.title}</div>
              <div className="text-xs text-gray-400 font-bold mb-3">{t.subtitle}</div>
              <div className="space-y-1 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 font-bold">車程</span>
                  <span className="font-black text-primary">{t.duration}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-400 font-bold">車資</span>
                  <span className="font-black text-orange-500">{t.fare}</span>
                </div>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">{t.description}</p>
              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700 flex items-center gap-1 text-xs font-black text-primary">
                <Navigation className="w-3.5 h-3.5" /> Google Maps 導航
              </div>
            </a>
          ))}
        </div>
      </div>

      {/* ═══════════════════════════════
          第三區：建議
      ═══════════════════════════════ */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-900/30 rounded-2xl p-5">
        <p className="text-blue-700 dark:text-blue-300 text-sm font-bold leading-relaxed">
          💡 <strong>Day 1 建議：</strong>JX800 航班 12:55 抵達成田，建議選擇{" "}
          <strong className="text-primary">JR 總武快速直達</strong>（官方約 85 分鐘）轉乘少，
          或<strong className="text-primary">利木津巴士</strong>（約 ¥3,100、官方約 120 分鐘）直達飯店免搬行李。
          抵達時間請依入境速度與當日班次彈性順延。
        </p>
        <a
          href="https://www.tobuhotel.co.jp/levant/access/"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl border border-blue-200 bg-white/70 px-4 py-2 text-sm font-black text-blue-700 underline decoration-blue-300 underline-offset-4 transition-colors hover:bg-white dark:border-blue-800 dark:bg-slate-900/40 dark:text-blue-300 dark:hover:bg-slate-900"
        >
          <ExternalLink className="h-4 w-4" />
          查看飯店官方交通與巴士時刻
        </a>
      </div>
    </section>
  );
}
