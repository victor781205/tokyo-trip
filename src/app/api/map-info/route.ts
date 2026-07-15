import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { isAllowedMapUrl, mapInfoQuerySchema } from "@/lib/validations";

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 512 * 1024; // 512KB

const CAT_KEYWORDS: Record<string, string[]> = {
  "🍣": ["sushi", "壽司", "すし", "sashimi", "刺身", "zanmai"],
  "🍜": ["ramen", "拉麵", "ラーメン", "noodle", "udon", "うどん", "そば", "soba", "一蘭", "ichiran"],
  "🥩": ["steak", "yakiniku", "燒肉", "焼肉", "wagyu", "和牛", "beef", "bbq"],
  "🍱": ["bento", "便當", "convenience", "便利商店", "7-eleven", "lawson", "family mart", "familymart"],
  "🍺": ["bar", "pub", "izakaya", "居酒屋", "beer", "酒", "sake"],
  "☕": ["cafe", "coffee", "咖啡", "珈琲", "starbucks", "tully"],
  "🍰": ["cake", "dessert", "bakery", "甜點", "ケーキ", "蛋糕", "parfait"],
  "🍡": ["dango", "wagashi", "和菓子", "mochi", "大福"],
  "🍔": ["burger", "漢堡", "hamburger", "shake shack"],
  "🍕": ["pizza", "italian", "義大利", "pasta", "義式"],
  "🍛": ["curry", "咖哩", "カレー"],
  "🍦": ["ice cream", "冰淇淋", "gelato", "ソフトクリーム"],
  "🥟": ["dumpling", "餃子", "gyoza", "小籠包"],
  "🐟": ["seafood", "海鮮", "魚", "tuna", "maguro"],
};

function sanitizeCandidateName(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : " ";
    })
    .replace(/&#(\d+);/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return Number.isFinite(codePoint) && codePoint <= 0x10ffff
        ? String.fromCodePoint(codePoint)
        : " ";
    })
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&(?:apos|#39);/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isGenericMapName(value: string): boolean {
  const n = sanitizeCandidateName(value).toLowerCase();
  if (!n) return true;
  if (n === "google 地圖" || n === "google maps" || n === "maps") return true;
  // 純座標不應當店名
  if (/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(n)) return true;
  // Google 預設文案 / 破掉的 meta 內容
  if (
    n.includes("利用「google 地圖」") ||
    n.includes("find local businesses") ||
    n.includes("google maps") ||
    n.includes('name="description"') ||
    n.includes("itemprop=") ||
    n.includes("<meta") ||
    n.length > 80
  ) {
    return true;
  }
  return false;
}

function extractMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["'][^>]*>|<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["'][^>]*>`,
      "i"
    );
    const m = html.match(re);
    const raw = m?.[1] || m?.[2];
    if (raw) return sanitizeCandidateName(raw);
  }
  return "";
}

function decodeLoose(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " ")).trim();
  } catch {
    return value.replace(/\+/g, " ").trim();
  }
}

function pickEmojiAndCategory(text: string): { emoji: string; category: string } {
  const low = text.toLowerCase();
  for (const [emoji, keywords] of Object.entries(CAT_KEYWORDS)) {
    if (keywords.some((k) => low.includes(k.toLowerCase()))) {
      const category =
        keywords.find((k) => low.includes(k.toLowerCase()) && /[^\x00-\x7F]/.test(k)) ||
        keywords.find((k) => low.includes(k.toLowerCase())) ||
        "";
      return { emoji, category };
    }
  }
  return { emoji: "🍜", category: "" };
}

function extractCoords(finalUrl: string, html: string): { lat?: number; lng?: number } {
  const sources = [finalUrl, html];
  for (const src of sources) {
    // /@lat,lng,zoom
    let m = src.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // data=!3dlat!4dlng
    m = src.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // ?q=lat,lng 或 query=lat,lng
    m = src.match(/[?&](?:q|query)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };

    // ll=lat,lng / center=lat,lng
    m = src.match(/[?&](?:ll|center)=(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/i);
    if (m) return { lat: parseFloat(m[1]), lng: parseFloat(m[2]) };
  }
  return {};
}

function extractNameFromUrl(finalUrl: string): string {
  try {
    const urlObj = new URL(finalUrl);
    const path = decodeLoose(urlObj.pathname);
    // /maps/place/Name/ 或 /maps/search/Name/
    const placeMatch =
      path.match(/\/maps\/place\/([^/]+)/) || path.match(/\/maps\/search\/([^/]+)/);
    if (placeMatch?.[1]) {
      const candidate = placeMatch[1].replace(/\+/g, " ").trim();
      if (!isGenericMapName(candidate)) return candidate;
    }

    const q =
      urlObj.searchParams.get("q") ||
      urlObj.searchParams.get("query") ||
      urlObj.searchParams.get("destination");
    if (q) {
      const candidate = decodeLoose(q);
      if (!isGenericMapName(candidate)) return candidate;
    }
  } catch {
    /* continue */
  }
  return "";
}

async function fetchMapHtml(startUrl: string): Promise<{ finalUrl: string; html: string }> {
  let currentUrl = startUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isAllowedMapUrl(currentUrl)) {
      throw new Error("Redirect target is not an allowed Google Maps host");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(currentUrl, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
          "Accept-Language": "zh-TW,zh;q=0.9,ja;q=0.8,en-US;q=0.7,en;q=0.6",
          Accept: "text/html,application/xhtml+xml",
        },
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("Redirect without Location header");
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Upstream responded ${response.status}`);
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType && !/text\/html|application\/xhtml\+xml|text\/plain/i.test(contentType)) {
        throw new Error("Unexpected content type from map URL");
      }

      const contentLength = Number(response.headers.get("content-length") ?? "0");
      if (contentLength > MAX_RESPONSE_BYTES) {
        throw new Error("Response too large");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        const text = await response.text();
        if (text.length > MAX_RESPONSE_BYTES) throw new Error("Response too large");
        return { finalUrl: response.url || currentUrl, html: text };
      }

      const chunks: Uint8Array[] = [];
      let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          total += value.byteLength;
          if (total > MAX_RESPONSE_BYTES) {
            try {
              await reader.cancel();
            } catch {
              /* ignore */
            }
            throw new Error("Response too large");
          }
          chunks.push(value);
        }
      }

      const merged = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const html = new TextDecoder("utf-8", { fatal: false }).decode(merged);
      return { finalUrl: response.url || currentUrl, html };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("Too many redirects");
}

export async function GET(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "anonymous";
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
    const { finalUrl, html } = await fetchMapHtml(parsed.data.url.trim());

    let name = extractNameFromUrl(finalUrl);
    let category = "";
    let address = "";
    let hours = "";
    let emoji = "🍜";

    // --- STRATEGY 2: Extract from HTML Content (Preview links or Data) ---
    if (isGenericMapName(name)) {
      const qMatch =
        html.match(/&q=([^&"']+)/) ||
        html.match(/[\?&]q=([^&"']+)/) ||
        html.match(/"q":"([^"]+)"/);
      if (qMatch?.[1]) {
        const candidate = sanitizeCandidateName(decodeLoose(qMatch[1]));
        if (!isGenericMapName(candidate)) name = candidate;
      }
    }

    // --- STRATEGY 3: Extract from Metadata (Description / og:title) ---
    const descContent = extractMetaContent(html, [
      "Description",
      "description",
      "og:description",
    ]);
    const ogTitle = extractMetaContent(html, ["og:title"]);

    if (descContent) {
      if (isGenericMapName(name)) {
        const parts = descContent.split(", ");
        const candidate = parts[0]?.trim() || "";
        if (!isGenericMapName(candidate)) name = candidate;
      }

      // Address extraction
      const parts = descContent.split(", ");
      const addressPart = parts.find(
        (p) =>
          p.match(/\d{3}-\d{4}/) ||
          p.includes("Tokyo") ||
          p.includes("City") ||
          p.includes("東京都") ||
          /[区區市]/.test(p)
      );
      if (addressPart) {
        address = addressPart.replace(/,?\s*Japan$/i, "").trim();
      }

      // Hours extraction
      const hoursPart = parts.find(
        (p) =>
          p.toLowerCase().includes("open") ||
          p.toLowerCase().includes("closed") ||
          p.includes("時") ||
          p.includes("営業")
      );
      if (hoursPart && hoursPart !== name) {
        hours = hoursPart.trim();
      }
    }

    if (isGenericMapName(name) && ogTitle) {
      const candidate = ogTitle
        .replace(/ - Google (地圖|Maps).*$/i, "")
        .replace(/ · .*$/, "")
        .trim();
      if (!isGenericMapName(candidate)) name = candidate;
    }

    // --- STRATEGY 4: Final Fallback to Title ---
    if (isGenericMapName(name)) {
      const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
      if (titleMatch?.[1]) {
        const candidate = sanitizeCandidateName(titleMatch[1])
          .replace(/ - Google (地圖|Maps).*$/i, "")
          .replace(/ · .*$/, "")
          .trim();
        if (!isGenericMapName(candidate)) name = candidate;
      }
    }

    // Clean up generic placeholders / pure coords / HTML garbage
    name = sanitizeCandidateName(name);
    if (isGenericMapName(name)) name = "";

    // Emoji / category：同時掃描店名 + description + URL
    const scanText = `${name} ${descContent} ${finalUrl}`;
    const picked = pickEmojiAndCategory(scanText);
    emoji = picked.emoji;
    category = picked.category;

    const district = identifyDistrict(name, address, descContent, finalUrl);
    const { lat, lng } = extractCoords(finalUrl, html);

    // 若完全解析不到店名，回 422 讓前端顯示可操作訊息（而不是 200 + 空 name）
    if (!name) {
      return NextResponse.json(
        {
          error: "Could not extract place name from this map link",
          finalUrl,
          lat,
          lng,
          location: district || address,
        },
        {
          status: 422,
          headers: { "X-RateLimit-Remaining": String(remaining) },
        }
      );
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
    const message = error instanceof Error ? error.message : "Failed to fetch map info";
    console.error("Map info fetch error:", error);

    // 短網址失效 / 上游拒絕：用 502 區分內部錯誤
    const status =
      /Upstream responded|Redirect target|Too many redirects|aborted|timeout/i.test(message)
        ? 502
        : 500;

    return NextResponse.json(
      {
        error: "Failed to fetch map info",
        detail: process.env.NODE_ENV === "development" ? message : undefined,
      },
      { status }
    );
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
    { name: "銀座", keywords: ["銀座", "ginza", "yurakucho", "有樂町", "有楽町", "tsukiji", "築地"] },
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
    if (area.keywords.some((k) => text.includes(k))) {
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
        { name: "豐洲", lat: 35.6552, lng: 139.7925 },
      ];

      let closest: { name: string; lat: number; lng: number } | null = null;
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
  } catch {
    /* Coordinate parsing failed, continue to next fallback */
  }

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
