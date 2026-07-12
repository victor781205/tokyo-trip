"use client";

import { useState } from "react";
import { Volume2, ChevronDown, Search } from "lucide-react";

const PHRASE_CATEGORIES: Record<string, { emoji: string; phrases: { jp: string; romaji: string; zh: string }[] }> = {
  "基本問候": {
    emoji: "👋",
    phrases: [
      { jp: "こんにちは", romaji: "Konnichiwa", zh: "你好" },
      { jp: "おはようございます", romaji: "Ohayou gozaimasu", zh: "早安" },
      { jp: "こんばんは", romaji: "Konbanwa", zh: "晚安 (問候)" },
      { jp: "さようなら", romaji: "Sayounara", zh: "再見" },
      { jp: "ありがとうございます", romaji: "Arigatou gozaimasu", zh: "非常感謝" },
      { jp: "すみません", romaji: "Sumimasen", zh: "不好意思 / 對不起" },
      { jp: "はい / いいえ", romaji: "Hai / Iie", zh: "是 / 不是" },
      { jp: "おねがいします", romaji: "Onegai shimasu", zh: "拜託 / 請" },
    ],
  },
  "交通出行": {
    emoji: "🚆",
    phrases: [
      { jp: "駅はどこですか？", romaji: "Eki wa doko desu ka?", zh: "車站在哪裡？" },
      { jp: "いくらですか？", romaji: "Ikura desu ka?", zh: "多少錢？" },
      { jp: "〜までお願いします", romaji: "... made onegai shimasu", zh: "請到～（搭計程車）" },
      { jp: "この電車は〜に行きますか？", romaji: "Kono densha wa ... ni ikimasu ka?", zh: "這班電車有到～嗎？" },
      { jp: "次の駅はどこですか？", romaji: "Tsugi no eki wa doko desu ka?", zh: "下一站是哪裡？" },
      { jp: "タクシーを呼んでください", romaji: "Takushii wo yonde kudasai", zh: "請幫我叫計程車" },
    ],
  },
  "餐廳美食": {
    emoji: "🍜",
    phrases: [
      { jp: "メニューをください", romaji: "Menyuu wo kudasai", zh: "請給我菜單" },
      { jp: "おすすめは何ですか？", romaji: "Osusume wa nan desu ka?", zh: "推薦什麼？" },
      { jp: "〜をおねがいします", romaji: "... wo onegai shimasu", zh: "我要點～" },
      { jp: "おいしいです！", romaji: "Oishii desu!", zh: "好吃！" },
      { jp: "お会計お願いします", romaji: "Okaikei onegai shimasu", zh: "請結帳" },
      { jp: "アレルギーがあります", romaji: "Arerugii ga arimasu", zh: "我有過敏" },
      { jp: "ベジタリアンです", romaji: "Bejitarian desu", zh: "我是素食者" },
      { jp: "お水をください", romaji: "Omizu wo kudasai", zh: "請給我水" },
    ],
  },
  "購物": {
    emoji: "🛍️",
    phrases: [
      { jp: "これはいくらですか？", romaji: "Kore wa ikura desu ka?", zh: "這個多少錢？" },
      { jp: "試着してもいいですか？", romaji: "Shichaku shite mo ii desu ka?", zh: "可以試穿嗎？" },
      { jp: "もう少し安くできますか？", romaji: "Mou sukoshi yasuku dekimasu ka?", zh: "可以再便宜一點嗎？" },
      { jp: "カードで払えますか？", romaji: "Kaado de haraemasu ka?", zh: "可以刷卡嗎？" },
      { jp: "免税できますか？", romaji: "Menzei dekimasu ka?", zh: "可以免稅嗎？" },
      { jp: "袋をください", romaji: "Fukuro wo kudasai", zh: "請給我袋子" },
    ],
  },
  "緊急狀況": {
    emoji: "🚨",
    phrases: [
      { jp: "助けてください！", romaji: "Tasukete kudasai!", zh: "請幫幫我！" },
      { jp: "病院に行きたいです", romaji: "Byouin ni ikitai desu", zh: "我想去醫院" },
      { jp: "警察を呼んでください", romaji: "Keisatsu wo yonde kudasai", zh: "請叫警察" },
      { jp: "パスポートをなくしました", romaji: "Pasupooto wo nakushimashita", zh: "我的護照不見了" },
      { jp: "中国語/英語が話せますか？", romaji: "Chuugokugo/Eigo ga hanasemasu ka?", zh: "你會說中文/英文嗎？" },
      { jp: "通訳をおねがいします", romaji: "Tsuyaku wo onegai shimasu", zh: "請幫我翻譯" },
    ],
  },
  "住宿": {
    emoji: "🏨",
    phrases: [
      { jp: "チェックインお願いします", romaji: "Chekkuin onegai shimasu", zh: "我要辦理入住" },
      { jp: "チェックアウトは何時ですか？", romaji: "Chekkuauto wa nanji desu ka?", zh: "退房時間是幾點？" },
      { jp: "Wi-Fiのパスワードは？", romaji: "Waifai no pasuwaado wa?", zh: "Wi-Fi 密碼是什麼？" },
      { jp: "タオルを追加でください", romaji: "Taoru wo tsuika de kudasai", zh: "請多給我毛巾" },
      { jp: "荷物を預かっていただけますか？", romaji: "Nimotsu wo azukatte itadakemasu ka?", zh: "可以寄放行李嗎？" },
    ],
  },
};

/** 中文常用說法 → 可匹配到的關鍵字（日文／中文／羅馬拼音） */
const SEARCH_ALIASES: Record<string, string[]> = {
  "謝謝": ["感謝", "ありがとう", "arigatou", "非常感謝"],
  "感謝": ["謝謝", "ありがとう", "arigatou", "非常感謝"],
  "不好意思": ["對不起", "すみません", "sumimasen"],
  "對不起": ["不好意思", "すみません", "sumimasen"],
  "廁所": ["トイレ", "toilet", "洗手間"],
  "洗手間": ["廁所", "トイレ", "toilet"],
  "救命": ["幫幫", "助け", "tasukete"],
  "幫幫": ["救命", "助け", "tasukete"],
  "結帳": ["會計", "お会計", "okaikei", "買單"],
  "買單": ["結帳", "會計", "お会計"],
  "菜單": ["メニュー", "menyuu"],
  "水": ["お水", "omizu"],
  "醫院": ["病院", "byouin"],
  "警察": ["けいさつ", "keisatsu"],
  "翻譯": ["通訳", "tsuyaku"],
};

function expandSearchTerms(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const terms = new Set<string>([trimmed.toLowerCase()]);
  for (const [key, aliases] of Object.entries(SEARCH_ALIASES)) {
    const keyLower = key.toLowerCase();
    if (
      trimmed.includes(key) ||
      key.includes(trimmed) ||
      aliases.some((alias) => trimmed.toLowerCase().includes(alias.toLowerCase()) || alias.toLowerCase().includes(trimmed.toLowerCase()))
    ) {
      terms.add(keyLower);
      aliases.forEach((alias) => terms.add(alias.toLowerCase()));
    }
  }
  return Array.from(terms);
}

export function JapanesePhrases() {
  const [expanded, setExpanded] = useState<string | null>("基本問候");
  const [search, setSearch] = useState("");
  const searchTerms = expandSearchTerms(search);

  const filteredCategories = Object.entries(PHRASE_CATEGORIES).map(([cat, data]) => ({
    category: cat,
    ...data,
    phrases: searchTerms.length > 0
      ? data.phrases.filter(
        p => searchTerms.some((term) =>
          p.jp.toLowerCase().includes(term) ||
          p.zh.toLowerCase().includes(term) ||
          p.romaji.toLowerCase().includes(term)
        )
      )
      : data.phrases,
  })).filter(c => c.phrases.length > 0);

  const handleSpeak = (text: string) => {
    if ("speechSynthesis" in window) {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.rate = 0.85;
      speechSynthesis.speak(utterance);
    }
  };

  return (
    <section id="phrases" className="py-6 md:py-20 transition-colors duration-300 scroll-mt-28">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-block bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-4 py-1 rounded-full text-xs font-black uppercase tracking-widest mb-4">Travel Phrases</div>
        <h2 className="text-2xl sm:text-3xl md:text-5xl font-black mb-4">🇯🇵 實用日語短語</h2>
        <p className="text-gray-600 dark:text-gray-400">旅遊必備日語，點擊喇叭圖示可聆聽發音</p>
      </div>

      {/* Search */}
      <div className="relative mb-8 max-w-md mx-auto">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="搜尋日語短語"
          placeholder="搜尋日語短語..."
          className="w-full pl-14 pr-5 py-4 rounded-2xl border-2 border-gray-100 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:outline-none transition-all font-bold"
        />
      </div>

      {/* Phrase Categories */}
      <div className="space-y-4">
        {filteredCategories.map((cat) => {
          const isExpanded = expanded === cat.category;
          return (
            <div key={cat.category} className="bg-white dark:bg-slate-800 rounded-3xl shadow-lg border border-gray-100 dark:border-slate-700 overflow-hidden">
              <button
                onClick={() => setExpanded(isExpanded ? null : cat.category)}
                aria-expanded={isExpanded}
                className="w-full flex items-center justify-between p-5 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{cat.emoji}</span>
                  <h3 className="font-black text-lg text-gray-900 dark:text-white">{cat.category}</h3>
                  <span className="text-xs font-bold text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-0.5 rounded-full">{cat.phrases.length} 句</span>
                </div>
                <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 space-y-2">
                  {cat.phrases.map((phrase, i) => (
                    <div key={i} className="bg-gray-50 dark:bg-slate-900 rounded-2xl p-4 hover:shadow-md transition-all group">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-black text-xl text-gray-900 dark:text-white">{phrase.jp}</span>
                            <button
                              onClick={() => handleSpeak(phrase.jp)}
                              aria-label={`播放發音：${phrase.jp}`}
                              className="w-11 h-11 shrink-0 inline-flex items-center justify-center rounded-xl text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors opacity-100 md:opacity-0 md:group-hover:opacity-100"
                              title="聆聽發音"
                            >
                              <Volume2 className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">{phrase.romaji}</p>
                          <p className="text-base font-bold text-primary mt-1">{phrase.zh}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {filteredCategories.length === 0 && (
          <div role="status" className="text-center py-10 rounded-3xl border-2 border-dashed border-gray-200 dark:border-slate-700 text-gray-400 font-bold">
            找不到符合「{search.trim()}」的短語，試試較短的關鍵字。
          </div>
        )}
      </div>
    </section>
  );
}
