const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!API_KEY) { console.error("Missing GOOGLE_MAPS_API_KEY env var"); process.exit(1); }

const RESTAURANTS = [
  // ramen
  "一蘭 澀谷店",
  "AFURI 原宿",
  "風雲兒 新宿",
  "真鯛らーめん 面魚 錦糸町",
  "六厘舍 東京車站",
  "銀座 篝 Kagari",
  "入鹿 TOKYO 六本木",
  "麵屋武藏 新宿本店",
  "鴨to蔥 上野",
  "金色不如歸 新宿",
  // sushi
  "寿司大 豊洲",
  "美登利寿司 梅丘",
  "根室花丸 銀座",
  "寿司郎 浅草",
  "まんてん鮨 丸の内",
  "銀座 久兵衛",
  "沼津港 新宿",
  "くら寿司 押上",
  "寿司清 錦糸町",
  "築地虎杖 丹後",
  // yakiniku
  "叙々苑 遊玄亭 新宿",
  "六歌仙 新宿",
  "牛かつもと村 渋谷",
  "肉の萬世 秋葉原",
  "焼肉ライク 錦糸町",
  "USHIGORO S. 銀座",
  "薩摩牛の蔵 渋谷",
  "鉄板焼白秋 渋谷",
  "土古里 新宿",
  "今半 人形町",
  // cafe
  "HARBS 新宿",
  "ブルーボトルコーヒー 渋谷",
  "スターバックスリザーブロースタリー 中目黒",
  "浅草 梅園",
  "bills 銀座",
  "Qu'il fait bon 銀座",
  "辻利 晴空塔",
  "Ginza West",
  "カフェ・ド・ランブル 銀座",
  "喫茶YOU 銀座",
  // local
  "利久牛舌 晴空塔",
  "上野 大統領",
  "浅草 大黒家",
  "伊豆榮 上野",
  "鳥貴族 錦糸町",
  "三定 浅草",
  "アメ横鉄火丼 上野",
  "磯丸水産 渋谷",
  "とり錦 錦糸町",
  "銀座 梅林",
  // global
  "銀座 煉瓦亭",
  "Shake Shack 表参道",
  "Luke's Lobster 表参道",
  "The Apollo 銀座",
  "T's TanTan 東京駅",
  "Kanda Tamagoken 秋葉原",
  "Mercer Brunch 銀座",
  "バーガーマニア 渋谷",
  "龍吟 銀座",
  "ゴンパッチ 西麻布",
];

async function queryPlace(name) {
  const query = encodeURIComponent(name + " 東京");
  const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${API_KEY}&language=ja`;
  
  try {
    const res = await fetch(url);
    const data = await res.json();
    
    if (data.status === "OK" && data.results.length > 0) {
      const place = data.results[0];
      return {
        search: name,
        found: place.name,
        rating: place.rating,
        reviews: place.user_ratings_total,
        address: place.formatted_address,
      };
    }
    return { search: name, found: null, error: data.status };
  } catch (e) {
    return { search: name, found: null, error: e.message };
  }
}

async function main() {
  const results = [];
  
  for (let i = 0; i < RESTAURANTS.length; i++) {
    const name = RESTAURANTS[i];
    process.stdout.write(`[${i + 1}/${RESTAURANTS.length}] 查詢: ${name}...`);
    const result = await queryPlace(name);
    results.push(result);
    
    if (result.found) {
      console.log(` ✅ ${result.found} | ⭐${result.rating} | 📝${result.reviews}`);
    } else {
      console.log(` ❌ ${result.error}`);
    }
    
    // Rate limiting - wait 200ms between requests
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log("\n\n=== 結果摘要 ===");
  console.log(JSON.stringify(results, null, 2));
}

main();
