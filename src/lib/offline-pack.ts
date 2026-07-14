import type {
  BudgetItem,
  Itinerary,
  PackingItem,
} from "@/context/TripContext";

export const OFFLINE_PACK_VERSION = 1;
export const OFFLINE_PACK_CACHE_NAME = "tokyo-trip-offline-pack-v1";
export const OFFLINE_NAVIGATION_CACHE_NAME = "tokyo-navigation-pages";
export const OFFLINE_APP_SHELL_URL = "/";

export const HOTEL_OFFLINE_INFO = {
  name: "東京東武黎凡特飯店 / Tobu Levant Hotel Tokyo",
  addressZh: "東京都墨田區錦糸 1-2-2，130-0013",
  addressJa: "〒130-0013 東京都墨田区錦糸1丁目2番2号",
  nearestStation: "JR／東京メトロ半藏門線 錦糸町站，北口步行約 3 分鐘",
  mapUrl: "https://www.google.com/maps/search/?api=1&query=Tobu+Levant+Hotel+Tokyo",
} as const;

export const EMERGENCY_OFFLINE_INFO = [
  { label: "警察", number: "110", japanese: "警察を呼んでください。" },
  { label: "救護車／消防", number: "119", japanese: "救急車を呼んでください。" },
  { label: "駐日代表處", number: "03-3280-7811", japanese: "台湾の代表処に連絡したいです。" },
  { label: "JNTO 旅遊熱線", number: "050-3816-2787", japanese: "中国語の案内をお願いします。" },
] as const;

export const ESSENTIAL_PHRASES = [
  { zh: "請帶我去這間飯店", ja: "このホテルまで連れて行ってください。" },
  { zh: "我需要醫院", ja: "病院に行きたいです。" },
  { zh: "我迷路了，請幫助我", ja: "道に迷いました。助けてください。" },
  { zh: "請幫我叫救護車", ja: "救急車を呼んでください。" },
] as const;

export type OfflineHotelInfo = {
  name: string;
  addressZh: string;
  addressJa: string;
  nearestStation: string;
  mapUrl: string;
};

export type OfflineEmergencyInfo = {
  label: string;
  number: string;
  japanese: string;
};

export type OfflinePhrase = {
  zh: string;
  ja: string;
};

export type OfflineTripPack = {
  version: number;
  savedAt: string;
  tripId: string;
  itinerary: Itinerary;
  budget: {
    limit: number;
    items: BudgetItem[];
  };
  packingList: PackingItem[];
  hotel: OfflineHotelInfo;
  emergency: readonly OfflineEmergencyInfo[];
  phrases: readonly OfflinePhrase[];
};

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isOptionalString(value: unknown) {
  return value === undefined || typeof value === "string";
}

function isActivity(value: unknown) {
  return isRecord(value)
    && isOptionalString(value.syncId)
    && isOptionalString(value.sourceId)
    && (value.status === undefined || value.status === "done" || value.status === "skipped")
    && typeof value.time === "string"
    && typeof value.name === "string"
    && typeof value.desc === "string"
    && typeof value.tag === "string";
}

function isItinerary(value: unknown) {
  return isRecord(value) && Object.values(value).every((day) => (
    isRecord(day)
    && typeof day.title === "string"
    && typeof day.date === "string"
    && Array.isArray(day.activities)
    && day.activities.every(isActivity)
  ));
}

function isBudgetItem(value: unknown) {
  return isRecord(value)
    && typeof value.id === "number"
    && Number.isFinite(value.id)
    && isOptionalString(value.syncId)
    && typeof value.name === "string"
    && typeof value.amount === "number"
    && Number.isFinite(value.amount)
    && typeof value.category === "string"
    && typeof value.date === "string"
    && isOptionalString(value.payer)
    && (
      value.participants === undefined
      || (Array.isArray(value.participants) && value.participants.every((item) => typeof item === "string"))
    );
}

function isPackingItem(value: unknown) {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.name === "string"
    && typeof value.packed === "boolean"
    && typeof value.category === "string";
}

function isHotelInfo(value: unknown) {
  return isRecord(value)
    && typeof value.name === "string"
    && typeof value.addressZh === "string"
    && typeof value.addressJa === "string"
    && typeof value.nearestStation === "string"
    && typeof value.mapUrl === "string";
}

function isEmergencyInfo(value: unknown) {
  return isRecord(value)
    && typeof value.label === "string"
    && typeof value.number === "string"
    && typeof value.japanese === "string";
}

function isPhrase(value: unknown) {
  return isRecord(value)
    && typeof value.zh === "string"
    && typeof value.ja === "string";
}

/**
 * Cache Storage is durable but not trusted input. Validate the minimum shape
 * before presenting a cached snapshot so a stale/corrupt response cannot crash
 * the offline viewer.
 */
export function isOfflineTripPack(value: unknown): value is OfflineTripPack {
  if (!isRecord(value)) return false;
  if (
    value.version !== OFFLINE_PACK_VERSION
    || typeof value.savedAt !== "string"
    || Number.isNaN(Date.parse(value.savedAt))
    || typeof value.tripId !== "string"
    || !isItinerary(value.itinerary)
    || !isRecord(value.budget)
    || !Array.isArray(value.packingList)
    || !value.packingList.every(isPackingItem)
    || !isHotelInfo(value.hotel)
    || !Array.isArray(value.emergency)
    || !Array.isArray(value.phrases)
  ) return false;

  return (
    typeof value.budget.limit === "number"
    && Number.isFinite(value.budget.limit)
    && Array.isArray(value.budget.items)
    && value.budget.items.every(isBudgetItem)
    && value.emergency.length > 0
    && value.emergency.every(isEmergencyInfo)
    && value.emergency.some((item) => isRecord(item) && item.number === "110")
    && value.emergency.some((item) => isRecord(item) && item.number === "119")
    && value.phrases.length > 0
    && value.phrases.every(isPhrase)
  );
}

export function offlinePackCacheUrl(tripId: string) {
  return `/__offline-pack__/${encodeURIComponent(tripId || "local")}`;
}

export async function readOfflineTripPack(
  cacheStorage: CacheStorage,
  tripId: string,
): Promise<OfflineTripPack | null> {
  try {
    const cache = await cacheStorage.open(OFFLINE_PACK_CACHE_NAME);
    const response = await cache.match(offlinePackCacheUrl(tripId));
    if (!response) return null;
    const parsed: unknown = await response.json();
    return isOfflineTripPack(parsed) && parsed.tripId === tripId ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Save an offline snapshot only after the app shell has been fetched, cached,
 * and read back successfully. The pack is committed last, so its savedAt is a
 * reliable readiness marker instead of reporting success for a partial cache.
 */
export async function persistOfflineTripPack({
  cacheStorage,
  pack,
  fetcher = fetch,
}: {
  cacheStorage: CacheStorage;
  pack: OfflineTripPack;
  fetcher?: FetchLike;
}): Promise<OfflineTripPack> {
  const shellResponse = await fetcher(OFFLINE_APP_SHELL_URL, {
    cache: "no-cache",
    credentials: "same-origin",
    headers: { Accept: "text/html" },
  });
  const contentType = shellResponse.headers.get("content-type")?.toLowerCase() ?? "";
  if (!shellResponse.ok || !contentType.includes("text/html")) {
    throw new Error("offline app shell unavailable");
  }

  const navigationCache = await cacheStorage.open(OFFLINE_NAVIGATION_CACHE_NAME);
  await navigationCache.put(OFFLINE_APP_SHELL_URL, shellResponse.clone());
  const verifiedShell = await navigationCache.match(OFFLINE_APP_SHELL_URL, {
    ignoreSearch: true,
  });
  if (!verifiedShell?.ok) throw new Error("offline app shell verification failed");

  const packCache = await cacheStorage.open(OFFLINE_PACK_CACHE_NAME);
  await packCache.put(
    offlinePackCacheUrl(pack.tripId),
    new Response(JSON.stringify(pack), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );
  const verifiedPack = await readOfflineTripPack(cacheStorage, pack.tripId);
  if (!verifiedPack || verifiedPack.savedAt !== pack.savedAt) {
    throw new Error("offline pack verification failed");
  }
  return verifiedPack;
}

export function createOfflineTripPack(input: {
  tripId: string;
  itinerary: Itinerary;
  budgetLimit: number;
  budgetItems: BudgetItem[];
  packingList: PackingItem[];
  savedAt?: Date;
}): OfflineTripPack {
  return {
    version: OFFLINE_PACK_VERSION,
    savedAt: (input.savedAt ?? new Date()).toISOString(),
    tripId: input.tripId,
    itinerary: input.itinerary,
    budget: {
      limit: input.budgetLimit,
      items: input.budgetItems,
    },
    packingList: input.packingList,
    hotel: HOTEL_OFFLINE_INFO,
    emergency: EMERGENCY_OFFLINE_INFO,
    phrases: ESSENTIAL_PHRASES,
  };
}

const RAIN_FALLBACKS: Record<number, string[]> = {
  1: ["把淺草戶外散步縮短，改逛晴空塔／Solamachi 室內區域", "保留彈性入住時間，避免拖著行李趕雨中行程"],
  2: ["把明治神宮與新宿御苑改成短停，優先原宿、澀谷室內商場", "保留 SHIBUYA SKY 預約時間，出發前確認官方營運狀態"],
  3: ["優先東京車站一番街、地下街與銀座百貨", "皇居外苑視雨勢縮短，將空檔留給室內購物"],
  4: ["先走 teamLab Planets 與 DiverCity 室內行程", "台場海濱公園與夜景改成雨勢轉小後的彈性選項"],
  5: ["下北澤改以店舖與咖啡廳為主", "井之頭公園縮短，準時前往需預約的吉卜力美術館"],
  6: ["採購改到上野或東京車站有遮蔽的商場", "預留更多時間回飯店取行李並前往機場"],
};

export function getRainFallbacks(dayNumber: number) {
  return RAIN_FALLBACKS[dayNumber] ?? RAIN_FALLBACKS[1];
}

export function shouldShowRainPlan(pop: string | number | null | undefined) {
  const value = typeof pop === "number" ? pop : Number.parseInt(pop ?? "", 10);
  return Number.isFinite(value) && value >= 50;
}
