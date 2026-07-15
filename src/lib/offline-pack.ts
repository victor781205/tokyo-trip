import type {
  BudgetItem,
  Itinerary,
  PackingItem,
} from "@/context/TripContext";

export const OFFLINE_PACK_VERSION = 1;
export const OFFLINE_PACK_CACHE_NAME = "tokyo-trip-offline-pack-v1";
export const OFFLINE_NAVIGATION_CACHE_NAME = "tokyo-navigation-pages";
export const OFFLINE_APP_SHELL_URL = "/";
export const OFFLINE_PACK_MAX_IMPORT_BYTES = 2 * 1024 * 1024;

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

export type OfflinePackImportErrorCode =
  | "empty"
  | "too_large"
  | "invalid_json"
  | "unsupported_version"
  | "invalid_schema"
  | "trip_mismatch";

export type OfflinePackImportValidation =
  | {
    ok: true;
    pack: OfflineTripPack;
    byteLength: number;
  }
  | {
    ok: false;
    code: OfflinePackImportErrorCode;
    message: string;
  };

type FetchLike = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]) {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isBoundedString(value: unknown, maxLength: number, allowEmpty = true): value is string {
  return typeof value === "string"
    && value.length <= maxLength
    && (allowEmpty || value.length > 0);
}

function isOptionalBoundedString(value: unknown, maxLength: number) {
  return value === undefined || isBoundedString(value, maxLength, false);
}

function isActivity(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["syncId", "sourceId", "status", "time", "name", "desc", "tag"])
    && isOptionalBoundedString(value.syncId, 160)
    && isOptionalBoundedString(value.sourceId, 512)
    && (value.status === undefined || value.status === "done" || value.status === "skipped")
    && isBoundedString(value.time, 32)
    && isBoundedString(value.name, 300)
    && isBoundedString(value.desc, 2_000)
    && isBoundedString(value.tag, 80);
}

function isItinerary(value: unknown) {
  if (!isRecord(value)) return false;
  const days = Object.entries(value);
  return days.length <= 31 && days.every(([dayKey, day]) => (
    /^day(?:[1-9]|[12]\d|3[01])$/.test(dayKey)
    && isRecord(day)
    && hasOnlyKeys(day, ["title", "date", "activities"])
    && isBoundedString(day.title, 300)
    && isBoundedString(day.date, 80)
    && Array.isArray(day.activities)
    && day.activities.length <= 200
    && day.activities.every(isActivity)
  ));
}

function isBudgetItem(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "syncId", "name", "amount", "category", "date", "payer", "participants"])
    && typeof value.id === "number"
    && Number.isSafeInteger(value.id)
    && isOptionalBoundedString(value.syncId, 160)
    && isBoundedString(value.name, 300)
    && typeof value.amount === "number"
    && Number.isFinite(value.amount)
    && Math.abs(value.amount) <= 999_999_999
    && isBoundedString(value.category, 80)
    && isBoundedString(value.date, 80)
    && (value.payer === undefined || isBoundedString(value.payer, 120, false))
    && (
      value.participants === undefined
      || (
        Array.isArray(value.participants)
        && value.participants.length <= 32
        && value.participants.every((item) => isBoundedString(item, 120, false))
      )
    );
}

function isPackingItem(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["id", "name", "packed", "category"])
    && isBoundedString(value.id, 200, false)
    && isBoundedString(value.name, 300)
    && typeof value.packed === "boolean"
    && isBoundedString(value.category, 100);
}

function isHotelInfo(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["name", "addressZh", "addressJa", "nearestStation", "mapUrl"])
    && isBoundedString(value.name, 300, false)
    && isBoundedString(value.addressZh, 500, false)
    && isBoundedString(value.addressJa, 500, false)
    && isBoundedString(value.nearestStation, 500, false)
    && isBoundedString(value.mapUrl, 2_048, false)
    && value.mapUrl.startsWith("https://");
}

function isEmergencyInfo(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["label", "number", "japanese"])
    && isBoundedString(value.label, 100, false)
    && isBoundedString(value.number, 40, false)
    && isBoundedString(value.japanese, 500, false);
}

function isPhrase(value: unknown) {
  return isRecord(value)
    && hasOnlyKeys(value, ["zh", "ja"])
    && isBoundedString(value.zh, 500, false)
    && isBoundedString(value.ja, 500, false);
}

/**
 * Cache Storage is durable but not trusted input. Validate the complete v1
 * shape and bounded field sizes before presenting a cached snapshot so a
 * stale/corrupt response cannot crash the offline viewer.
 */
export function isOfflineTripPack(value: unknown): value is OfflineTripPack {
  if (!isRecord(value)) return false;
  if (
    !hasOnlyKeys(value, [
      "version",
      "savedAt",
      "tripId",
      "itinerary",
      "budget",
      "packingList",
      "hotel",
      "emergency",
      "phrases",
    ])
    || value.version !== OFFLINE_PACK_VERSION
    || !isBoundedString(value.savedAt, 64, false)
    || Number.isNaN(Date.parse(value.savedAt))
    || new Date(value.savedAt).toISOString() !== value.savedAt
    || !isBoundedString(value.tripId, 200)
    || !isItinerary(value.itinerary)
    || !isRecord(value.budget)
    || !hasOnlyKeys(value.budget, ["limit", "items"])
    || !Array.isArray(value.packingList)
    || value.packingList.length > 2_000
    || !value.packingList.every(isPackingItem)
    || !isHotelInfo(value.hotel)
    || !Array.isArray(value.emergency)
    || value.emergency.length > 20
    || !Array.isArray(value.phrases)
    || value.phrases.length > 100
  ) return false;

  return (
    typeof value.budget.limit === "number"
    && Number.isFinite(value.budget.limit)
    && value.budget.limit >= 0
    && value.budget.limit <= 999_999_999
    && Array.isArray(value.budget.items)
    && value.budget.items.length <= 5_000
    && value.budget.items.every(isBudgetItem)
    && value.emergency.length > 0
    && value.emergency.every(isEmergencyInfo)
    && value.emergency.some((item) => isRecord(item) && item.number === "110")
    && value.emergency.some((item) => isRecord(item) && item.number === "119")
    && value.phrases.length > 0
    && value.phrases.every(isPhrase)
  );
}

/**
 * Parse an exported offline backup without touching Cache Storage or TripState.
 * The caller can safely show a preview and ask for confirmation first.
 */
export function validateOfflineTripPackImport(
  rawText: string,
  expectedTripId: string,
): OfflinePackImportValidation {
  const byteLength = new TextEncoder().encode(rawText).byteLength;
  if (byteLength === 0 || rawText.trim().length === 0) {
    return { ok: false, code: "empty", message: "備份檔是空的，請重新選擇 JSON 檔。" };
  }
  if (byteLength > OFFLINE_PACK_MAX_IMPORT_BYTES) {
    return {
      ok: false,
      code: "too_large",
      message: `備份檔超過 ${(OFFLINE_PACK_MAX_IMPORT_BYTES / 1024 / 1024).toFixed(0)} MB 上限，未讀取內容。`,
    };
  }

  let parsed: unknown;
  try {
    const normalizedText = rawText.charCodeAt(0) === 0xfeff ? rawText.slice(1) : rawText;
    parsed = JSON.parse(normalizedText) as unknown;
  } catch {
    return { ok: false, code: "invalid_json", message: "無法解析這個檔案；請選擇由本網站匯出的 JSON 備份。" };
  }

  if (!isRecord(parsed)) {
    return { ok: false, code: "invalid_schema", message: "備份格式不完整，未匯入任何資料。" };
  }
  if (parsed.version !== OFFLINE_PACK_VERSION) {
    return {
      ok: false,
      code: "unsupported_version",
      message: `不支援此備份版本（${String(parsed.version ?? "未標示")}）；目前僅支援版本 ${OFFLINE_PACK_VERSION}。`,
    };
  }
  if (!isOfflineTripPack(parsed)) {
    return { ok: false, code: "invalid_schema", message: "備份內容未通過完整性驗證，未匯入任何資料。" };
  }
  if (parsed.tripId !== expectedTripId) {
    return {
      ok: false,
      code: "trip_mismatch",
      message: "這份備份屬於另一趟行程；為避免混入錯誤資料，已停止匯入。",
    };
  }

  return { ok: true, pack: parsed, byteLength };
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
 * Commit a previously validated import to the offline snapshot cache. This is
 * intentionally separate from TripState: an offline pack is a partial export
 * and must never masquerade as a complete synchronized-trip restore.
 */
export async function persistImportedOfflineTripPack({
  cacheStorage,
  pack,
  expectedTripId,
}: {
  cacheStorage: CacheStorage;
  pack: OfflineTripPack;
  expectedTripId: string;
}): Promise<OfflineTripPack> {
  if (!isOfflineTripPack(pack) || pack.tripId !== expectedTripId) {
    throw new Error("offline import validation failed");
  }

  const cache = await cacheStorage.open(OFFLINE_PACK_CACHE_NAME);
  const cacheUrl = offlinePackCacheUrl(expectedTripId);
  const previous = await cache.match(cacheUrl);
  await cache.put(
    cacheUrl,
    new Response(JSON.stringify(pack), {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    }),
  );

  const verifiedPack = await readOfflineTripPack(cacheStorage, expectedTripId);
  if (verifiedPack && JSON.stringify(verifiedPack) === JSON.stringify(pack)) return verifiedPack;

  if (previous) await cache.put(cacheUrl, previous);
  else await cache.delete(cacheUrl);
  throw new Error("offline import verification failed");
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
