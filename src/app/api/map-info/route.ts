import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { mapInfoQuerySchema } from "@/lib/validations";

const ALLOWED_DOMAINS = [
  "maps.google.com",
  "www.google.com/maps",
  "goo.gl/maps",
  "maps.app.goo.gl",
];

function isAllowedMapUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_DOMAINS.some((domain) => {
      const [hostname, ...pathParts] = domain.split("/");
      return parsed.hostname === hostname && (pathParts.length === 0 || parsed.pathname.startsWith("/" + pathParts.join("/")));
    });
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for") ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`map:${ip}`, 40, 60_000);

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  const url = req.nextUrl.searchParams.get("url");

  const parsed = mapInfoQuerySchema.safeParse({ url });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 }
    );
  }

  if (!isAllowedMapUrl(parsed.data.url)) {
    return NextResponse.json({ error: "URL must be a Google Maps link" }, { status: 403 });
  }

  try {
    const response = await fetch(parsed.data.url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      redirect: "follow",
    });

    const finalUrl = response.url;
    const html = await response.text();

    let name = "";
    let category = "";
    let address = "";
    let hours = "";
    let emoji = "🍜";

    // --- STRATEGY 1: Extract from Redirected URL Path ---
    try {
      const urlObj = new URL(finalUrl);
      const path = decodeURIComponent(urlObj.pathname);
      // Matches /maps/place/Name+Here/ or /maps/search/Name+Here/
      const placeMatch = path.match(/\/maps\/place\/(.*?)\//) || path.match(/\/maps\/search\/(.*?)\//);
      if (placeMatch && placeMatch[1]) {
        name = placeMatch[1].replace(/\+/g, " ").trim();
      }
    } catch { /* URL parsing failed, continue to next strategy */ }

    // --- STRATEGY 2: Extract from HTML Content (Preview links or Data) ---
    if (!name || name === "Google 地圖" || name === "Google Maps") {
      // Look for preview link q parameter: <link href="/maps/preview/place?...q=Name+Here&...
      const qMatch = html.match(/&amp;q=(.*?)&amp;/) || html.match(/[\?&]q=(.*?)&/);
      if (qMatch && qMatch[1]) {
        name = decodeURIComponent(qMatch[1]).replace(/\+/g, " ").trim();
      }
    }

    // --- STRATEGY 3: Extract from Metadata (Description) ---
    const descMatch = html.match(/<meta content="(.*?)"\s+name="Description"/i) ||
      html.match(/<meta name="Description"\s+content="(.*?)"/i);

    if (descMatch && descMatch[1]) {
      const descContent = descMatch[1];
      // If name wasn't found yet, the first part of description is often the name
      if (!name || name === "Google 地圖" || name === "Google Maps") {
        const parts = descContent.split(", ");
        if (parts.length >= 1 && !parts[0].includes("利用「Google 地圖」")) {
          name = parts[0].trim();
        }
      }

      // Category & Emoji Keywords
      const catKeywords = {
        "🍣": ["sushi", "壽司", "sashimi"],
        "🍜": ["ramen", "拉麵", "noodle", "udon", "そば", "soba"],
        "🥩": ["steak", "yakiniku", "燒肉", "beef", "meat", "bbq"],
        "🍱": ["bento", "box", "lunch", "convenience", "便利商店", "7-eleven", "lawson", "family mart"],
        "🍺": ["bar", "pub", "izakaya", "居酒屋", "beer", "酒"],
        "☕": ["cafe", "coffee", "咖啡"],
        "🍰": ["cake", "dessert", "bakery", "甜點", "蛋糕"],
        "🍡": ["dango", "wagashi", "和菓子", "mochi"],
        "🍔": ["burger", "漢堡", "hamburger", "shake tree"],
        "🍕": ["pizza", "italian"],
        "🍛": ["curry", "咖哩"],
        "🍦": ["ice cream", "冰淇淋", "gelato"],
      };

      // Scan description for category keywords
      const lowDesc = descContent.toLowerCase();
      for (const [e, keywords] of Object.entries(catKeywords)) {
        if (keywords.some(k => lowDesc.includes(k))) {
          emoji = e;
          // Try to extract the specific category name from description
          const parts = descContent.split(", ");
          category = parts.find(p => keywords.some(k => p.toLowerCase().includes(k))) || "";
          break;
        }
      }

      // Address extraction
      const parts = descContent.split(", ");
      const addressPart = parts.find(p => p.match(/\d{3}-\d{4}/) || p.includes("Tokyo") || p.includes("City"));
      if (addressPart) {
        address = addressPart.replace(", Japan", "").trim();
      }

      // Hours extraction
      const hoursPart = parts.find(p => p.toLowerCase().includes("open") || p.toLowerCase().includes("closed") || p.includes("時"));
      if (hoursPart && hoursPart !== name) {
        hours = hoursPart.trim();
      }
    }

    // --- STRATEGY 4: Final Fallback to Title ---
    if (!name || name === "Google 地圖" || name === "Google Maps") {
      const titleMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleMatch && titleMatch[1]) {
        name = titleMatch[1].replace(/ - Google (地圖|Maps)/gi, "").trim();
      }
    }

    // Clean up generic placeholders
    if (name === "Google 地圖" || name === "Google Maps") name = "";

    const district = identifyDistrict(name, address, descMatch?.[1] || "", finalUrl);

    // ── 提取座標 ──
    let lat: number | undefined;
    let lng: number | undefined;
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      lat = parseFloat(coordMatch[1]);
      lng = parseFloat(coordMatch[2]);
    }

    return NextResponse.json(
      {
        name,
        emoji,
        location: district || address,
        hours,
        category,
        finalUrl,
        lat,
        lng,
      },
      { headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  } catch (error) {
    console.error("Map info fetch error:", error);
    return NextResponse.json({ error: "Failed to fetch map info" }, { status: 500 });
  }
}

function identifyDistrict(name: string, address: string, description: string, finalUrl: string): string {
  const text = `${name} ${address} ${description}`.toLowerCase();

  const areas = [
    { name: "澀谷", keywords: ["澀谷", "渋谷", "shibuya", "harajuku", "原宿", "omotesando", "表參道", "表参道", "udagawacho", "宇田川町"] },
    { name: "新宿", keywords: ["新宿", "shinjuku", "kabukicho", "歌舞伎町"] },
    { name: "錦糸町", keywords: ["錦糸町", "kinshicho", "kinshi", "錦糸"] },
    { name: "淺草", keywords: ["淺草", "浅草", "asakusa", "kaminarimon", "雷門"] },
    { name: "上野", keywords: ["上野", "ueno", "ameyoko", "阿美橫"] },
    { name: "秋葉原", keywords: ["秋葉原", "akihabara", "akiba", "sotokanda", "外神田"] },
    { name: "池袋", keywords: ["池袋", "ikebukuro", "higashi-ikebukuro", "東池袋"] },
    { name: "銀座", keywords: ["銀座", "ginza", "yurakucho", "有樂町", "有樂町", "tsukiji", "築地"] },
    { name: "六本木", keywords: ["六本木", "roppongi", "azabu", "麻布", "roppongi hills"] },
    { name: "押上", keywords: ["押上", "oshiage", "skytree", "晴空塔"] },
    { name: "東京車站", keywords: ["東京駅", "東京車站", "tokyo station", "marunouchi", "丸之內", "丸の内", "nihonbashi", "日本橋"] },
    { name: "台場", keywords: ["台場", "odaiba", "daiba"] },
    { name: "中目黑", keywords: ["中目黑", "中目黒", "nakameguro"] },
    { name: "惠比壽", keywords: ["惠比壽", "恵比寿", "ebisu"] },
    { name: "代官山", keywords: ["代官山", "daikanyama"] },
    { name: "吉祥寺", keywords: ["吉祥寺", "kichijoji"] },
    { name: "豐洲", keywords: ["豐洲", "toyosu"] },
    { name: "墨田區", keywords: ["墨田", "sumida"] },
    { name: "台東區", keywords: ["台東", "taito"] },
    { name: "江東區", keywords: ["江東", "koto"] },
    { name: "港區", keywords: ["港區", "minato"] },
    { name: "千代田區", keywords: ["千代田", "chiyoda"] },
    { name: "中央區", keywords: ["中央區", "chuo"] },
  ];

  for (const area of areas) {
    if (area.keywords.some(k => text.includes(k))) {
      return area.name;
    }
  }

  // Fallback 1: Coordinate-based matching from finalUrl
  try {
    const coordMatch = finalUrl.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (coordMatch) {
      const lat = parseFloat(coordMatch[1]);
      const lng = parseFloat(coordMatch[2]);

      const DISTRICT_COORDS = [
        { name: "秋葉原", lat: 35.6986, lng: 139.7742 },
        { name: "澀谷", lat: 35.6580, lng: 139.7016 },
        { name: "新宿", lat: 35.6909, lng: 139.7003 },
        { name: "錦糸町", lat: 35.6968, lng: 139.8144 },
        { name: "淺草", lat: 35.7148, lng: 139.7967 },
        { name: "上野", lat: 35.7141, lng: 139.7774 },
        { name: "銀座", lat: 35.6724, lng: 139.7645 },
        { name: "東京車站", lat: 35.6812, lng: 139.7671 },
        { name: "池袋", lat: 35.7295, lng: 139.7109 },
        { name: "押上", lat: 35.7113, lng: 139.8127 },
        { name: "六本木", lat: 35.6641, lng: 139.7317 },
        { name: "築地", lat: 35.6658, lng: 139.7728 },
        { name: "中目黑", lat: 35.6443, lng: 139.6990 },
        { name: "惠比壽", lat: 35.6467, lng: 139.7101 },
        { name: "原宿", lat: 35.6702, lng: 139.7027 },
        { name: "表參道", lat: 35.6652, lng: 139.7113 },
        { name: "吉祥寺", lat: 35.7031, lng: 139.5798 },
        { name: "豐洲", lat: 35.6552, lng: 139.7925 }
      ];

      let closest = null;
      let minDistance = Infinity;

      for (const d of DISTRICT_COORDS) {
        const dist = Math.sqrt(Math.pow(d.lat - lat, 2) + Math.pow(d.lng - lng, 2));
        if (dist < minDistance) {
          minDistance = dist;
          closest = d;
        }
      }

      // Max threshold: ~0.02 degrees (approx. 2.0 km) to prevent false matching outside Tokyo
      if (closest && minDistance < 0.02) {
        return closest.name;
      }
    }
  } catch { /* Coordinate parsing failed, continue to next fallback */ }

  // Fallback 2: Address pattern matching
  const cityMatch = address.match(/([a-zA-Z-\s]+)\s+City/i);
  if (cityMatch && cityMatch[1]) {
    return cityMatch[1].trim();
  }
  const jpCityMatch = address.match(/東京都([^\d\s〒-]+?[区區市])/);
  if (jpCityMatch && jpCityMatch[1]) {
    return jpCityMatch[1].trim();
  }

  return "";
}
