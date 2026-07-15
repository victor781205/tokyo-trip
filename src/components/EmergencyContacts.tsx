"use client";

import { useEffect, useRef, useState } from "react";
import { Phone, Shield, Stethoscope, Building2, Globe, MapPin, AlertTriangle, Heart, Languages, Volume2, ExternalLink, Copy, Navigation, X, Maximize2, ChevronDown } from "lucide-react";

const CONTACTS = [
  { icon: Shield, label: "日本報警", number: "110", sub: "警察 (Police)", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  { icon: Stethoscope, label: "救護車・消防", number: "119", sub: "急救 (Ambulance / Fire)", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
  { icon: Building2, label: "駐日代表處", number: "03-3280-7811", sub: "辦公時間緊急救助請按分機 4", color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  { icon: Globe, label: "JNTO 旅遊熱線", number: "050-3816-2787", sub: "24小時多語言觀光諮詢", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  { icon: Heart, label: "駐日代表處緊急手機", number: "080-1009-7179", sub: "生命安全緊急；備援 080-1009-7436", color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  { icon: Shield, label: "駐日代表處夜間警衛", number: "03-3280-7917", sub: "辦公時間外的緊急救助聯絡", color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
];

const HOSPITALS = [
  {
    name: "東京都立墨東病院",
    area: "墨田區江東橋 4-23-15（錦糸町附近）",
    phone: "+81-3-3633-6151",
    note: "JMIP；英／中醫療口譯僅平日 09:00–17:00，急診口譯不保證",
    languages: "英／中（平日 09:00–17:00）",
    hours: "急診 24h；到院前先電話",
    distanceHint: "錦糸町步行約 10 分",
    url: "https://www.tmhp.jp/bokutoh/about/information/foreign-patient-language.html",
  },
  {
    name: "聖路加國際病院",
    area: "中央區明石町 9-1",
    phone: "+81-3-3541-5151",
    note: "國際醫院・出發前可先電話確認科別",
    languages: "英語為主",
    hours: "門診平日・急診需確認",
    distanceHint: "築地／明石町一帶",
    url: "https://hospital.luke.ac.jp/",
  },
  {
    name: "東京警察病院",
    area: "中野區中野 4-22-1",
    phone: "+81-3-5343-5611",
    note: "官方代表號・非緊急狀況先電話確認",
    languages: "日語為主",
    hours: "門診平日・急診先電話",
    distanceHint: "中野站附近",
    url: "https://www.keisatsubyoin.or.jp/access/",
  },
];

const EMERGENCY_PHRASES = [
  { jp: "助けてください！", roma: "Tasukete kudasai!", zh: "請幫幫我！" },
  { jp: "救急車を呼んでください", roma: "Kyūkyūsha wo yonde kudasai", zh: "請叫救護車" },
  { jp: "病院に連れて行ってください", roma: "Byōin ni tsurete itte kudasai", zh: "請帶我去醫院" },
  { jp: "警察を呼んでください", roma: "Keisatsu wo yonde kudasai", zh: "請叫警察" },
  { jp: "通訳をお願いします", roma: "Tsūyaku wo onegai shimasu", zh: "請安排口譯" },
  { jp: "日本語がわかりません", roma: "Nihongo ga wakarimasen", zh: "我不懂日語" },
] as const;

const HOTEL = {
  name: "東京東武黎凡特飯店",
  japaneseName: "東武ホテルレバント東京",
  address: "〒130-0013 東京都墨田区錦糸1-2-2",
  mapUrl: "https://www.google.com/maps/dir/?api=1&destination=Tobu+Hotel+Levant+Tokyo",
};

export function EmergencyContacts() {
  const [showJapaneseCard, setShowJapaneseCard] = useState(false);
  const [selectedPhrase, setSelectedPhrase] = useState<(typeof EMERGENCY_PHRASES)[number]>(EMERGENCY_PHRASES[1]);
  const [copied, setCopied] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const handleCall = (number: string) => {
    const tel = number.replace(/[^+\d]/g, "");
    window.open(`tel:${tel}`, "_self");
  };

  const speakJapanese = (text: string) => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ja-JP";
    utterance.rate = 0.78;
    window.speechSynthesis.speak(utterance);
  };

  const copyText = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      window.setTimeout(() => setCopied(null), 2_000);
    } catch {
      setCopied(null);
    }
  };

  const openJapaneseCard = (phrase: (typeof EMERGENCY_PHRASES)[number]) => {
    setSelectedPhrase(phrase);
    setShowJapaneseCard(true);
  };

  useEffect(() => {
    if (!showJapaneseCard) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowJapaneseCard(false);
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
      previouslyFocused?.focus();
    };
  }, [showJapaneseCard]);

  return (
    <section id="emergency" className="py-4 md:py-9 transition-colors duration-300 scroll-mt-28">
      {/* Header */}
      <div className="text-center mb-6 md:mb-8">
        <div className="inline-block bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Emergency Info</div>
        <h2 className="flex items-center justify-center gap-2 text-2xl md:text-3xl font-black mb-3"><AlertTriangle className="h-7 w-7 text-red-600" />緊急聯絡資訊</h2>
        <p className="text-gray-600 dark:text-gray-300">日本旅遊必備的緊急電話與求助管道</p>
      </div>

      {/* 首屏緊急操作 */}
      <div className="grid grid-cols-2 gap-3 md:gap-5 mb-5">
        {CONTACTS.slice(0, 2).map((contact) => {
          const Icon = contact.icon;
          return (
            <button
              key={contact.number}
              type="button"
              onClick={() => handleCall(contact.number)}
              aria-label={`立即撥打 ${contact.label}：${contact.number}`}
              className={`min-h-28 md:min-h-36 rounded-3xl p-4 md:p-6 text-left shadow-xl border-2 active:scale-[0.98] transition-transform ${contact.number === "110"
                ? "bg-blue-700 border-blue-800 text-white dark:bg-blue-800"
                : "bg-red-700 border-red-800 text-white dark:bg-red-800"}`}
            >
              <div className="flex items-center gap-2 text-xs md:text-sm font-black text-white/90">
                <Icon className="w-5 h-5" /> {contact.label}
              </div>
              <div className="font-mono text-4xl md:text-5xl font-black mt-2 leading-none">{contact.number}</div>
              <div className="text-xs font-bold text-white/90 mt-2">點一下立即撥打</div>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-7">
        <button
          type="button"
          onClick={() => openJapaneseCard(EMERGENCY_PHRASES[1])}
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 dark:bg-white px-5 font-black text-white dark:text-slate-950 shadow-lg active:scale-[0.98]"
        >
          <Maximize2 className="w-5 h-5" /> 給日本人看
        </button>
        <a
          href={HOTEL.mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-5 font-black text-gray-800 dark:text-white shadow-sm"
        >
          <Navigation className="w-5 h-5 text-primary" /> 導航回飯店
        </a>
      </div>

      {/* 收合的長提醒 */}
      <details className="group mb-8 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 font-black text-amber-900 dark:text-amber-200 [&::-webkit-details-marker]:hidden">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          重要提醒與口譯資訊
          <ChevronDown className="ml-auto w-5 h-5 transition-transform group-open:rotate-180" />
        </summary>
        <div className="px-5 pb-5 text-sm leading-relaxed text-amber-900 dark:text-amber-200">
          人在日本時，警察直接撥 110、救護車／消防直接撥 119，不需加日本國碼。部分地區 119 已導入多語三方口譯，是否提供依所在地與當下服務為準；語言不通可先說「通訳をお願いします」。非緊急醫療請先致電確認是否能立即接診。駐日代表處另一支緊急備援手機為 080-1009-7436。
        </div>
      </details>

      {/* Contact Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
        {CONTACTS.slice(2).map((contact) => {
          const Icon = contact.icon;
          return (
            <button
              key={contact.number}
              onClick={() => handleCall(contact.number)}
              aria-label={`撥打 ${contact.label}：${contact.number}`}
              className="trip-card bg-white dark:bg-slate-800 rounded-3xl p-6 shadow-lg border border-gray-100 dark:border-slate-700 hover:scale-[1.01] transition-transform active:scale-[0.98] text-left group"
            >
              <div className="flex items-start gap-4 mb-4">
                <div className={`p-3 rounded-2xl ${contact.color} group-hover:scale-110 transition-transform`}>
                  <Icon className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">{contact.label}</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{contact.sub}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 bg-gray-50 dark:bg-slate-900 rounded-2xl p-4">
                <Phone className="w-5 h-5 text-primary shrink-0" />
                <span className="font-mono font-black text-xl text-primary">{contact.number}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Hospital Section */}
      <div className="space-y-6">
        <div className="trip-card bg-white dark:bg-slate-800 rounded-3xl p-5 md:p-8 shadow-xl border border-gray-100 dark:border-slate-700">
        <div className="flex items-center gap-3 mb-6">
          <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-2xl">
            <Stethoscope className="w-6 h-6 text-red-500" />
          </div>
          <div>
            <h3 className="text-xl font-black text-gray-900 dark:text-white">可聯絡的醫療機構</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">到院前先電話確認接診與語言支援</p>
          </div>
        </div>
        <div className="space-y-4">
          {HOSPITALS.map((hospital) => (
            <div key={hospital.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 bg-gray-50 dark:bg-slate-900 rounded-2xl">
              <div>
                <h3 className="font-black text-gray-900 dark:text-white">{hospital.name}</h3>
                <p className="text-sm text-gray-600 dark:text-gray-300 flex items-center gap-1"><MapPin className="w-3 h-3" />{hospital.area}</p>
                <p className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mt-1">{hospital.note}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">
                    🗣 {hospital.languages}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">
                    ⏱ {hospital.hours}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 text-gray-600 dark:text-gray-300">
                    📍 {hospital.distanceHint}
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a
                  href={hospital.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-11 items-center gap-1.5 bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 px-3 py-2.5 rounded-xl font-black text-xs text-gray-600 dark:text-gray-300"
                >
                  <ExternalLink className="w-3.5 h-3.5" /> 官方資料
                </a>
                <button
                  onClick={() => handleCall(hospital.phone)}
                  aria-label={`撥打 ${hospital.name}：${hospital.phone}`}
                  className="flex min-h-11 items-center gap-2 bg-primary text-white px-5 py-2.5 rounded-xl font-black text-sm active:scale-95 transition-transform"
                >
                  <Phone className="w-4 h-4" />
                  {hospital.phone}
                </button>
              </div>
            </div>
          ))}
        </div>

          <p className="mt-5 text-xs text-gray-600 dark:text-gray-300 text-right">聯絡資料最後核對：2026-07-15</p>
        </div>

        {/* ── Emergency Japanese Phrases ── */}
        <div className="trip-card bg-white dark:bg-slate-800 rounded-3xl p-5 md:p-8 shadow-xl border border-gray-100 dark:border-slate-700">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-red-100 dark:bg-red-900/30 p-3 rounded-2xl">
              <Languages className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <h3 className="text-xl font-black text-gray-900 dark:text-white">緊急日語應急句</h3>
              <p className="text-sm text-gray-600 dark:text-gray-300">可播放發音，或全螢幕展示給對方看</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {EMERGENCY_PHRASES.map((phrase) => (
              <div key={phrase.jp} className="flex items-center gap-3 p-4 bg-red-50 dark:bg-red-900/10 rounded-2xl border border-red-100 dark:border-red-900/30">
                <div className="flex-1">
                  <div className="font-black text-lg text-red-700 dark:text-red-300">{phrase.jp}</div>
                  <div className="text-xs text-gray-600 dark:text-gray-300 font-mono">{phrase.roma}</div>
                  <div className="text-sm font-bold text-gray-600 dark:text-gray-300">{phrase.zh}</div>
                </div>
                <button
                  type="button"
                  onClick={() => speakJapanese(phrase.jp)}
                  aria-label={`播放「${phrase.jp}」發音`}
                  className="w-11 h-11 shrink-0 inline-flex items-center justify-center bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 rounded-full transition-colors"
                >
                  <Volume2 className="w-5 h-5 text-red-500" />
                </button>
                <button
                  type="button"
                  onClick={() => openJapaneseCard(phrase)}
                  aria-label={`全螢幕顯示「${phrase.jp}」`}
                  className="w-11 h-11 shrink-0 inline-flex items-center justify-center bg-slate-950 dark:bg-white text-white dark:text-slate-950 rounded-full transition-colors"
                >
                  <Maximize2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-3xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950/30 p-5 md:p-7">
          <div className="flex items-start gap-3 mb-4">
            <Building2 className="w-6 h-6 text-blue-700 dark:text-blue-300 shrink-0" />
            <div>
              <h3 className="font-black text-lg text-gray-900 dark:text-white">回飯店資訊</h3>
              <p className="font-black text-blue-800 dark:text-blue-200 mt-1">{HOTEL.japaneseName}</p>
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mt-1">{HOTEL.address}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <button type="button" onClick={() => speakJapanese(`${HOTEL.japaneseName}、${HOTEL.address}`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 font-black text-sm text-blue-800 dark:text-blue-200">
              <Volume2 className="w-4 h-4" /> 播放日文
            </button>
            <button type="button" onClick={() => void copyText("hotel", `${HOTEL.japaneseName}\n${HOTEL.address}`)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-900 font-black text-sm text-blue-800 dark:text-blue-200">
              <Copy className="w-4 h-4" /> {copied === "hotel" ? "已複製" : "複製地址"}
            </button>
            <a href={HOTEL.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-700 text-white font-black text-sm">
              <Navigation className="w-4 h-4" /> 開啟導航
            </a>
          </div>
        </div>
      </div>

      {showJapaneseCard && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/80 px-3 pb-[calc(0.75rem+var(--sab))] pt-[calc(0.75rem+var(--sat))] md:px-8 md:pb-[calc(2rem+var(--sab))] md:pt-[calc(2rem+var(--sat))]" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowJapaneseCard(false); }}>
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="emergency-japanese-card-title" className="relative flex h-[calc(100dvh-1.5rem-var(--sat)-var(--sab))] max-h-[680px] min-h-0 w-full max-w-4xl flex-col overflow-y-auto overscroll-contain rounded-[2rem] bg-white p-5 text-slate-950 shadow-2xl md:h-[calc(100dvh-4rem-var(--sat)-var(--sab))] md:p-10">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-red-700">Show this screen</p>
                <h3 id="emergency-japanese-card-title" className="text-xl font-black">この画面を見せてください</h3>
              </div>
              <button ref={closeButtonRef} type="button" onClick={() => setShowJapaneseCard(false)} aria-label="關閉日文求助卡" className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-900">
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
              <div className="text-[clamp(2.5rem,9vw,6rem)] font-black leading-tight text-red-700">{selectedPhrase.jp}</div>
              <div className="mt-5 text-lg font-bold text-slate-700">{selectedPhrase.roma}</div>
              <div className="mt-2 text-2xl font-black text-slate-950">{selectedPhrase.zh}</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <button type="button" onClick={() => speakJapanese(selectedPhrase.jp)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-red-700 px-4 font-black text-white">
                <Volume2 className="w-5 h-5" /> 播放日文
              </button>
              <button type="button" onClick={() => void copyText("phrase", selectedPhrase.jp)} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 font-black text-white">
                <Copy className="w-5 h-5" /> {copied === "phrase" ? "已複製" : "複製日文"}
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" aria-label="切換求助內容">
              {EMERGENCY_PHRASES.map((phrase) => (
                <button key={phrase.jp} type="button" aria-pressed={selectedPhrase.jp === phrase.jp} onClick={() => setSelectedPhrase(phrase)} className={`min-h-12 rounded-xl border px-3 text-sm font-black ${selectedPhrase.jp === phrase.jp ? "border-red-700 bg-red-50 text-red-800" : "border-slate-200 bg-white text-slate-800"}`}>
                  {phrase.zh}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
