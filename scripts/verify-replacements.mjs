const API_KEY = process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
if (!API_KEY) { console.error("Missing GOOGLE_MAPS_API_KEY env var"); process.exit(1); }

const REPLACEMENTS = [
  // 壽司 - 替換壽司郎(3.9)、沼津港(3.8)
  "回転寿司 根室花まる 新宿店",
  "寿司虎ノ門",
  // 燒肉 - 替換燒肉LIKE(3.6)、肉之萬世(179 reviews)
  "焼肉トラジ 恵比寿",
  "牛角 渋谷",
  // 居酒屋 - 替換鳥貴族(3.4)、阿美横(3.6)
  "鳥メロ 渋谷",
  "立ち呑み えびすや 上野",
  // 洋食 - 替換Mercer(3.8)、煉瓦亭(3.7)
  "洋食 やまもと 銀座",
  "ル・パン・コティディアン 表参道",
  // 甜點 - 替換梅園(4.0, 700+)
  "雷門三丁目 浅草",
  "パティスリーSATSUKI 日本橋",
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
        lat: place.geometry.location.lat,
        lng: place.geometry.location.lng,
      };
    }
    return { search: name, found: null, error: data.status };
  } catch (e) {
    return { search: name, found: null, error: e.message };
  }
}

async function main() {
  const results = [];
  
  for (let i = 0; i < REPLACEMENTS.length; i++) {
    const name = REPLACEMENTS[i];
    process.stdout.write(`[${i + 1}/${REPLACEMENTS.length}] 查詢: ${name}...`);
    const result = await queryPlace(name);
    results.push(result);
    
    if (result.found) {
      console.log(` ✅ ${result.found} | ⭐${result.rating} | 📝${result.reviews} | 📍${result.lat},${result.lng}`);
    } else {
      console.log(` ❌ ${result.error}`);
    }
    
    await new Promise(r => setTimeout(r, 200));
  }
  
  console.log("\n\n=== 結果摘要 ===");
  console.log(JSON.stringify(results, null, 2));
}

main();
