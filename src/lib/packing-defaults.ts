export const DEFAULT_PACKING_CATEGORIES: Record<string, { icon: string; items: string[] }> = {
  "衣物": {
    icon: "👕",
    items: ["透氣短袖 ×5", "內衣褲 ×6", "襪子 ×5", "薄外套（冷氣房用）", "睡衣", "泳衣", "帽子", "拖鞋", "運動鞋"],
  },
  "證件": {
    icon: "📄",
    items: ["護照", "身分證", "機票 (電子)", "飯店訂房確認", "旅遊保險單", "信用卡", "日幣現金"],
  },
  "電子用品": {
    icon: "🔌",
    items: ["手機", "充電器", "行動電源（最多 2 顆、每顆 ≤100Wh；隨身攜帶）", "耳機", "相機", "三腳轉兩腳轉接頭（需要時）", "USB 線"],
  },
  "日用品": {
    icon: "🧴",
    items: ["牙刷牙膏", "洗面乳", "防曬乳", "面膜", "衛生紙", "濕紙巾", "雨傘", "水壺"],
  },
  "藥品": {
    icon: "💊",
    items: ["感冒藥", "腸胃藥", "止痛藥", "OK繃", "防蚊液", "暈車藥", "眼藥水"],
  },
  "其他": {
    icon: "📦",
    items: ["塑膠袋", "夾鏈袋", "旅行用洗衣精", "摺疊購物袋", "頸枕", "眼罩"],
  },
};

export function canonicalPackingKey(category: string, name: string) {
  const normalize = (value: string) => value.trim().normalize("NFKC").replace(/\s+/g, " ");
  return `${normalize(category)}\u0000${normalize(name)}`;
}

const DEFAULT_KEYS = new Set(
  Object.entries(DEFAULT_PACKING_CATEGORIES).flatMap(([category, data]) =>
    data.items.map((name) => canonicalPackingKey(category, name))),
);

export function isDefaultPackingEntry(category: string, name: string) {
  return DEFAULT_KEYS.has(canonicalPackingKey(category, name));
}

export function defaultPackingItemId(category: string, name: string) {
  return `default:${encodeURIComponent(canonicalPackingKey(category, name))}`;
}
