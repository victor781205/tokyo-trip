import type { Itinerary } from "@/context/TripContext";

export const DEFAULT_ITINERARY: Itinerary = {
  day1: {
    title: "🛬 Day 1 - 抵達東京",
    date: "9/1 (二)",
    activities: [
      { time: "12:55", name: "抵達成田機場", desc: "辦理入境手續、領取行李", tag: "交通" },
      { time: "14:30", name: "前往飯店", desc: "依入境進度選 JR 總武快速或利木津巴士", tag: "交通" },
      { time: "16:30", name: "飯店 Check-in", desc: "班次／路況延誤時順延", tag: "" },
      { time: "17:00", name: "淺草寺・雷門", desc: "依抵達時間彈性調整", tag: "景點" },
      { time: "19:00", name: "晴空塔", desc: "欣賞夜景", tag: "景點" },
      { time: "20:30", name: "晚餐", desc: "淺草周邊用餐", tag: "美食" },
      { time: "22:00", name: "回飯店休息", desc: "整理隔日行程", tag: "" }
    ]
  },
  day2: {
    title: "⛩️ Day 2 - 澀谷・新宿",
    date: "9/2 (三)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "明治神宮", desc: "東京最大的神社", tag: "景點" },
      { time: "11:30", name: "原宿竹下通", desc: "年輕人潮流聖地", tag: "購物" },
      { time: "13:00", name: "午餐：拉麵", desc: "一蘭拉麵", tag: "美食" },
      { time: "14:30", name: "澀谷 Scramble Square", desc: "Sky 展望台", tag: "景點" },
      { time: "17:00", name: "新宿御苑", desc: "欣賞日式庭園", tag: "景點" },
      { time: "19:00", name: "晚餐：思出橫丁", desc: "串燒與關東煮", tag: "美食" }
    ]
  },
  day3: {
    title: "🏰 Day 3 - 秋葉原・東京車站",
    date: "9/3 (四)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "秋葉原電氣街", desc: "動漫、電器", tag: "購物" },
      { time: "12:00", name: "午餐", desc: "秋葉原女僕咖啡廳", tag: "美食" },
      { time: "14:00", name: "東京車站一番街", desc: "地下街購物", tag: "購物" },
      { time: "15:30", name: "皇居外苑", desc: "二重橋散步", tag: "景點" },
      { time: "17:00", name: "銀座逛街", desc: "東京最高級商店街", tag: "購物" },
      { time: "19:00", name: "晚餐：銀座壽司", desc: "新鮮握壽司", tag: "美食" }
    ]
  },
  day4: {
    title: "🌊 Day 4 - 台場・豐洲",
    date: "9/4 (五)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "豐洲市場", desc: "新鮮海鮮早餐", tag: "美食" },
      { time: "11:30", name: "台場海濱公園", desc: "自由女神、彩虹大橋", tag: "景點" },
      { time: "14:30", name: "DiverCity", desc: "1:1 鋼彈模型", tag: "景點" },
      { time: "16:30", name: "teamLab Planets TOKYO", desc: "豐洲沉浸式數位藝術體驗", tag: "景點" },
      { time: "19:00", name: "晚餐：燒肉", desc: "欣賞夜景", tag: "美食" },
      { time: "21:00", name: "台場夜景", desc: "彩虹大橋、自由女神與東京灣", tag: "景點" }
    ]
  },
  day5: {
    title: "🌸 Day 5 - 下北澤・吉祥寺",
    date: "9/5 (六)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "享用日式早餐", tag: "美食" },
      { time: "09:30", name: "下北澤古著街", desc: "二手服飾", tag: "購物" },
      { time: "12:00", name: "午餐：咖哩", desc: "日式咖哩名店", tag: "美食" },
      { time: "13:30", name: "吉祥寺井之頭公園", desc: "划船、散步", tag: "景點" },
      { time: "16:30", name: "吉卜力美術館", desc: "宮崎駿動畫迷必訪", tag: "景點" },
      { time: "19:00", name: "晚餐：迴轉壽司", desc: "最後一晚的壽司", tag: "美食" },
      { time: "21:00", name: "飯店收拾行李", desc: "準備明天回程", tag: "" }
    ]
  },
  day6: {
    title: "🛫 Day 6 - 回家",
    date: "9/6 (日)",
    activities: [
      { time: "08:00", name: "飯店早餐", desc: "最後一頓日式早餐", tag: "美食" },
      { time: "09:30", name: "上野阿美橫丁", desc: "採購伴手禮", tag: "購物" },
      { time: "11:00", name: "飯店 Check-out", desc: "標準退房時間，行李寄放櫃檯", tag: "" },
      { time: "12:00", name: "午餐", desc: "上野周邊用餐", tag: "美食" },
      { time: "14:00", name: "回飯店取行李", desc: "領取寄放行李，確認隨身物品", tag: "" },
      { time: "16:00", name: "前往成田機場", desc: "JR總武線", tag: "交通" },
      { time: "20:40", name: "登機 JX805", desc: "返回台北", tag: "交通" }
    ]
  }
};
