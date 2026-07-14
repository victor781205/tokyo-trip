"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_TRIP_SNAPSHOT,
  type SyncSlice,
  type TripSnapshot,
  mergeRemoteSnapshot,
  migrateLegacyTripCache,
  readTripCache,
  remoteRecordToSnapshot,
  writeTripCache,
} from "@/lib/trip-cache";
import { generateTripId, generateTripSecret } from "@/lib/secure-id";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const SYNC_SELECT_COLUMNS = [
  "itinerary",
  "budget_limit",
  "budget_items",
  "custom_foods",
  "packing_list",
  "updated_at",
  "revision",
].join(",");
const MAX_SYNC_ATTEMPTS = 3;

// ── localStorage 鍵名常數 ──
const STORAGE_KEYS = {
  tripId: "tokyoTripId",
  tripSecret: "tokyoTripSecret",
} as const;

export type Activity = { time: string; name: string; desc: string; tag: string };
export type DayPlan = { title: string; date: string; activities: Activity[] };
export type Itinerary = Record<string, DayPlan>;
export type BudgetItem = { id: number; name: string; amount: number; category: string; date: string };
export type CustomFood = {
  id: number;
  emoji: string;
  name: string;
  location: string;
  hours: string;
  desc: string;
  mapLink: string;
  image: string;
  lat?: number;
  lng?: number;
};
export type PackingItem = { id: string; name: string; packed: boolean; category: string };

export type SyncStatus = "connecting" | "online" | "offline" | "error";

type SetStateArg<T> = T | ((prev: T) => T);

interface TripContextType {
  isLoaded: boolean;
  syncStatus: SyncStatus;
  syncError: string | null;
  isShareReady: boolean;
  itinerary: Itinerary;
  budgetItems: BudgetItem[];
  budgetLimit: number;
  customFoods: CustomFood[];
  packingList: PackingItem[];
  tripId: string;
  tripSecret: string;
  setItinerary: (itin: SetStateArg<Itinerary>) => void;
  setBudgetItems: (items: SetStateArg<BudgetItem[]>) => void;
  setBudgetLimit: (limit: SetStateArg<number>) => void;
  setCustomFoods: (foods: SetStateArg<CustomFood[]>) => void;
  setPackingList: (list: SetStateArg<PackingItem[]>) => void;
  loginToTrip: (id: string, secret: string) => Promise<boolean>;
  /** 輪換目前行程的同步密碼；舊分享連結立刻失效 */
  rotateTripSecret: () => Promise<{ ok: boolean; newSecret?: string; error?: string }>;
  getShareLink: () => string;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

/** 安全寫入 localStorage（QuotaExceeded 等不應讓 UI 炸掉） */
function writeStorage(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch (err) {
    console.warn("[Sync] localStorage write failed:", key, err);
  }
}

/** 建立同時綁定 trip id + secret 的 Supabase client（配合 RLS）。 */
function createTripClient(tripId: string, secret: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        "x-trip-id": tripId,
        "x-trip-secret": secret,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function credentialsAreSupported(tripId: string, secret: string) {
  if (!tripId || !secret || /[\u0000-\u001f\u007f]/.test(tripId + secret)) return false;
  const encoder = new TextEncoder();
  return encoder.encode(tripId).byteLength <= 64 && encoder.encode(secret).byteLength <= 128;
}

/**
 * 只從 hash fragment 解析行程憑證。Query string 會進 server、log 與
 * Referer，因此即使看起來完整也絕不接受。
 */
function parseCredentialsFromLocation(): { tripId: string; secret: string } | null {
  if (typeof window === "undefined") return null;

  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashRaw);
  const hashTrip = hashParams.get("trip");
  const hashSecret = hashParams.get("secret");
  if (hashTrip && hashSecret) {
    const tripId = hashTrip.trim();
    const secret = hashSecret.trim();
    if (credentialsAreSupported(tripId, secret)) return { tripId, secret };
  }
  return null;
}

function locationContainsCredentialKeys() {
  if (typeof window === "undefined") return false;
  const query = new URLSearchParams(window.location.search);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return query.has("trip") || query.has("secret") || hash.has("trip") || hash.has("secret");
}

/**
 * 清掉 query/hash 中的憑證，同時保留不相關的 query/hash 狀態。
 * Query 憑證不會被接受，但仍立即移除，避免繼續出現在歷史與 Referer。
 */
function scrubCredentialsFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("trip");
    url.searchParams.delete("secret");
    const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
    if (hash.has("trip") || hash.has("secret")) {
      hash.delete("trip");
      hash.delete("secret");
      const remainingHash = hash.toString();
      url.hash = remainingHash ? `#${remainingHash}` : "";
    }
    window.history.replaceState(
      window.history.state,
      "",
      url.pathname + url.search + url.hash,
    );
  } catch {
    // ignore
  }
}

type SyncSnapshot = {
  itinerary?: unknown;
  budget_limit?: unknown;
  budget_items?: unknown;
  custom_foods?: unknown;
  packing_list?: unknown;
  updated_at?: string | null;
  revision?: number | null;
};

type SyncRecord = SyncSnapshot;

async function fetchSyncRecord(client: SupabaseClient, tripId: string) {
  const result = await client
    .from("sync_state")
    .select(SYNC_SELECT_COLUMNS)
    .eq("trip_id", tripId)
    .maybeSingle();
  return {
    data: result.data as SyncRecord | null,
    error: result.error,
  };
}

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("connecting");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isShareReady, setIsShareReady] = useState(false);
  const [itinerary, _setItinerary] = useState<Itinerary>({});
  const [budgetItems, _setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetLimit, _setBudgetLimit] = useState(100000);
  const [customFoods, _setCustomFoods] = useState<CustomFood[]>([]);
  const [packingList, _setPackingList] = useState<PackingItem[]>([]);

  const [tripId, setTripId] = useState<string>("");
  const [tripSecret, setTripSecret] = useState<string>("");
  /** 變更後觸發 push effect（離線重連 / 連線成功但 state 未變時仍要上送） */
  const [pushTick, setPushTick] = useState(0);

  const supabase = useRef<SupabaseClient | null>(null);
  const tripSecretRef = useRef<string>("");
  const pushReady = useRef(false);
  const remoteRevisionRef = useRef(0);
  const remoteUpdatedAtRef = useRef(0);
  const localUpdatedAtRef = useRef(0);
  const activeTripIdRef = useRef("");
  const dirtySlicesRef = useRef<Set<SyncSlice>>(new Set());
  const legacyMigrationRef = useRef(false);
  const stateVersionRef = useRef(0);
  const connectionGenerationRef = useRef(0);
  const loginAttemptRef = useRef(0);
  const initialUrlCredentialsRef = useRef<ReturnType<typeof parseCredentialsFromLocation> | undefined>(undefined);
  const isOnlineRef = useRef(true);
  /** 有尚未成功上送的本機變更 */
  const pendingPushRef = useRef(false);
  /** 最新 state 快照，供 reconnect flush 使用，避免 stale closure */
  const stateRef = useRef<TripSnapshot>(EMPTY_TRIP_SNAPSHOT);

  useEffect(() => {
    stateRef.current = { itinerary, budgetItems, budgetLimit, customFoods, packingList };
  }, [itinerary, budgetItems, budgetLimit, customFoods, packingList]);

  const persistCurrentCache = useCallback(() => {
    const id = activeTripIdRef.current;
    if (!id || typeof window === "undefined") return;
    try {
      writeTripCache(localStorage, id, {
        snapshot: stateRef.current,
        dirtySlices: [...dirtySlicesRef.current],
        remoteRevision: remoteRevisionRef.current,
        remoteUpdatedAt: remoteUpdatedAtRef.current,
        localUpdatedAt: localUpdatedAtRef.current,
        legacyMigration: legacyMigrationRef.current,
      });
    } catch (err) {
      console.warn("[Sync] trip cache write failed:", err);
    }
  }, []);

  /**
   * 套用遠端快照：寫入 React state + localStorage。
   * 舊版只 _setState，重整後 localStorage 舊值會蓋回 UI，且可能再把空/舊私藏名單推上雲端。
   */
  const applyRemoteSnapshot = useCallback((
    raw: SyncSnapshot,
    remoteRevision: number,
    remoteTs: number,
    preserveDirty = false,
  ) => {
    const id = activeTripIdRef.current;
    if (!id) return;
    const remoteSnapshot = remoteRecordToSnapshot(
      raw as Record<string, unknown>,
      stateRef.current,
    );
    const snapshot = preserveDirty
      ? mergeRemoteSnapshot(stateRef.current, remoteSnapshot, dirtySlicesRef.current)
      : remoteSnapshot;
    stateRef.current = snapshot;
    _setItinerary(snapshot.itinerary);
    _setBudgetLimit(snapshot.budgetLimit);
    _setBudgetItems(snapshot.budgetItems);
    _setCustomFoods(snapshot.customFoods);
    _setPackingList(snapshot.packingList);
    remoteRevisionRef.current = remoteRevision;
    remoteUpdatedAtRef.current = remoteTs;
    stateVersionRef.current += 1;
    if (preserveDirty) {
      pendingPushRef.current = dirtySlicesRef.current.size > 0;
    } else {
      localUpdatedAtRef.current = 0;
      dirtySlicesRef.current.clear();
      pendingPushRef.current = false;
      legacyMigrationRef.current = false;
    }
    persistCurrentCache();
  }, [persistCurrentCache]);

  /** 本機使用者變更：更新時間戳並標記待推送 */
  const markLocalMutation = useCallback((slice: SyncSlice) => {
    const now = Date.now();
    localUpdatedAtRef.current = now;
    dirtySlicesRef.current.add(slice);
    stateVersionRef.current += 1;
    pendingPushRef.current = true;
    persistCurrentCache();
  }, [persistCurrentCache]);

  const connectToTrip = useCallback(
    async (
      id: string,
      secret: string,
      client: SupabaseClient,
      expectExisting = false,
      preloadedData?: SyncRecord,
    ): Promise<boolean> => {
      const trimmedId = id.trim();
      const trimmedSecret = secret.trim();
      if (!credentialsAreSupported(trimmedId, trimmedSecret)) return false;
      const connectionGeneration = ++connectionGenerationRef.current;

      try {
        let data: SyncRecord | null = preloadedData ?? null;
        let queryError: { message: string } | null = null;
        if (!preloadedData) {
          const result = await fetchSyncRecord(client, trimmedId);
          data = result.data;
          queryError = result.error;
        }

        if (
          activeTripIdRef.current !== trimmedId ||
          connectionGenerationRef.current !== connectionGeneration
        ) return false;

        if (queryError) {
          console.warn("[Sync] Supabase unavailable, offline mode:", queryError.message);
          setSyncStatus("offline");
          setSyncError("資料庫查詢失敗: " + queryError.message);
          pushReady.current = true;
          return false;
        }

        if (data) {
          setIsShareReady(true);

          const parsedRemoteTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          const remoteTs = Number.isFinite(parsedRemoteTs) ? parsedRemoteTs : 0;
          const parsedRevision = Number(data.revision ?? 0);
          const remoteRevision = Number.isSafeInteger(parsedRevision) && parsedRevision >= 0
            ? parsedRevision
            : 0;
          const hasDirtySlices = dirtySlicesRef.current.size > 0;
          if (hasDirtySlices) {
            // Revision, not either device's clock, decides whether a refetch is
            // newer. Preserve only the locally dirty slices across that pull.
            applyRemoteSnapshot(data as SyncSnapshot, remoteRevision, remoteTs, true);
            pendingPushRef.current = true;
          } else {
            if (remoteRevision >= remoteRevisionRef.current) {
              applyRemoteSnapshot(data as SyncSnapshot, remoteRevision, remoteTs);
            }
          }
        } else {
          setIsShareReady(false);
          if (expectExisting || remoteRevisionRef.current > 0) {
            setSyncStatus("error");
            setSyncError("找不到此行程，或同步密碼不正確。");
            pushReady.current = true;
            return false;
          }
          // 雲端尚無此行程：建立 row，讓尚未編輯的空白行程也能被分享。
          pendingPushRef.current = true;
        }
        setSyncStatus("online");
        setSyncError(null);
        pushReady.current = true;

        // 連線成功後若有待上送本機變更，強制觸發 push（不依賴 state 再變一次）
        if (pendingPushRef.current) {
          setPushTick((t) => t + 1);
        }
        return true;
      } catch (err) {
        if (
          activeTripIdRef.current !== trimmedId ||
          connectionGenerationRef.current !== connectionGeneration
        ) return false;
        console.warn("[Sync] Connection error, offline mode:", err);
        setSyncStatus("offline");
        setSyncError(err instanceof Error ? "連線出錯: " + err.message : "連線發生未知錯誤");
        return false;
      } finally {
        if (
          activeTripIdRef.current === trimmedId &&
          connectionGenerationRef.current === connectionGeneration
        ) {
          pushReady.current = true;
        }
      }
    },
    [applyRemoteSnapshot],
  );

  // ── 初始載入 ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    const previousStoredId = localStorage.getItem(STORAGE_KEYS.tripId)?.trim();
    const previousStoredSecret = localStorage.getItem(STORAGE_KEYS.tripSecret)?.trim();
    let initId = previousStoredId;
    let initSecret = previousStoredSecret;

    // React Strict Mode 會 setup → cleanup → setup。第一次 setup scrub URL 後，
    // 第二次仍須沿用同一組分享憑證，不能退回舊行程。
    if (initialUrlCredentialsRef.current === undefined) {
      initialUrlCredentialsRef.current = parseCredentialsFromLocation();
      if (locationContainsCredentialKeys()) {
        scrubCredentialsFromUrl();
      }
    }
    const fromUrl = initialUrlCredentialsRef.current;
    const hasUrlCredentials = Boolean(fromUrl);

    if (fromUrl) {
      initId = fromUrl.tripId.trim();
      initSecret = fromUrl.secret.trim();
    } else if (!initId || !initSecret || !credentialsAreSupported(initId, initSecret)) {
      initId = generateTripId();
      initSecret = generateTripSecret();
    }

    const activeTripId = (initId ?? generateTripId()).trim();
    const activeTripSecret = (initSecret ?? generateTripSecret()).trim();

    // 分享連結必須先經遠端驗證；不可在驗證前覆寫原本 A 行程的持久憑證。
    if (!hasUrlCredentials) {
      writeStorage(STORAGE_KEYS.tripId, activeTripId);
      writeStorage(STORAGE_KEYS.tripSecret, activeTripSecret);
    }
    activeTripIdRef.current = activeTripId;
    setTripId(activeTripId);
    setTripSecret(activeTripSecret);
    tripSecretRef.current = activeTripSecret;

    const hydrateCache = (id: string, allowLegacy: boolean) => {
      const cached = allowLegacy
        ? migrateLegacyTripCache(localStorage, id)
        : readTripCache(localStorage, id);
      stateRef.current = cached.snapshot;
      dirtySlicesRef.current = new Set(cached.dirtySlices);
      remoteRevisionRef.current = cached.remoteRevision;
      remoteUpdatedAtRef.current = cached.remoteUpdatedAt;
      localUpdatedAtRef.current = cached.localUpdatedAt;
      legacyMigrationRef.current = cached.legacyMigration;
      pendingPushRef.current = cached.dirtySlices.length > 0;
      _setItinerary(cached.snapshot.itinerary);
      _setBudgetItems(cached.snapshot.budgetItems);
      _setBudgetLimit(cached.snapshot.budgetLimit);
      _setCustomFoods(cached.snapshot.customFoods);
      _setPackingList(cached.snapshot.packingList);
      persistCurrentCache();
    };

    // A share link must never cause the previous trip's global legacy cache to
    // be imported into the shared trip on the next reload. Attribute it to the
    // previously stored trip first, then clear globals only after that write.
    if (hasUrlCredentials && previousStoredId) {
      try {
        migrateLegacyTripCache(localStorage, previousStoredId);
      } catch (err) {
        console.warn("[Sync] legacy cache migration failed before trip switch:", err);
      }
    }

    // 每個 trip 使用獨立 cache；分享連結絕不讀取另一趟行程的舊版全域資料。
    hydrateCache(activeTripId, !hasUrlCredentials);
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn("[Sync] Supabase credentials not configured. Running in offline mode.");
      if (hasUrlCredentials && previousStoredId && previousStoredSecret) {
        activeTripIdRef.current = previousStoredId;
        tripSecretRef.current = previousStoredSecret;
        setTripId(previousStoredId);
        setTripSecret(previousStoredSecret);
        hydrateCache(previousStoredId, true);
      }
      setSyncStatus("offline");
      pushReady.current = true;
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    const client = createTripClient(activeTripId, activeTripSecret);
    supabase.current = client;

    connectToTrip(activeTripId, activeTripSecret, client, hasUrlCredentials).then(async (connected) => {
      if (cancelled) return;
      if (connected && hasUrlCredentials) {
        writeStorage(STORAGE_KEYS.tripId, activeTripId);
        writeStorage(STORAGE_KEYS.tripSecret, activeTripSecret);
      } else if (!connected && hasUrlCredentials && previousStoredId && previousStoredSecret) {
        // 分享連結無效／無權限：回復原行程，不讓錯誤 B 憑證取代 A。
        activeTripIdRef.current = previousStoredId;
        tripSecretRef.current = previousStoredSecret;
        setTripId(previousStoredId);
        setTripSecret(previousStoredSecret);
        hydrateCache(previousStoredId, true);
        const previousClient = createTripClient(previousStoredId, previousStoredSecret);
        supabase.current = previousClient;
        setSyncStatus("connecting");
        await connectToTrip(previousStoredId, previousStoredSecret, previousClient);
        if (cancelled) return;
      }
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      connectionGenerationRef.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 網路狀態監聽 ──
  useEffect(() => {
    if (typeof window === "undefined") return;

    isOnlineRef.current = navigator.onLine;

    const handleOnline = () => {
      isOnlineRef.current = true;
      if (supabase.current && tripId) {
        setSyncStatus("connecting");
        // 重連後先取得 server revision，並在 pending 時以 CAS flush。
        void connectToTrip(tripId, tripSecretRef.current || tripSecret, supabase.current);
      }
    };

    const handleOffline = () => {
      isOnlineRef.current = false;
      setSyncStatus("offline");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [connectToTrip, tripId, tripSecret]);

  // Realtime WebSocket 不會攜帶 REST 自訂憑證 header，因此不訂閱/消費
  // postgres_changes payload。改用可預期的 credential-bound REST pull：
  // 可見頁面每 30 秒、回到分頁、聚焦與恢復連線時更新。
  useEffect(() => {
    if (!isLoaded || !tripId || !supabase.current) return;

    const refresh = () => {
      if (
        !isOnlineRef.current ||
        document.visibilityState === "hidden" ||
        !supabase.current ||
        activeTripIdRef.current !== tripId
      ) return;
      void connectToTrip(
        tripId,
        tripSecretRef.current || tripSecret,
        supabase.current,
      );
    };
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    const timer = window.setInterval(refresh, 30_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [connectToTrip, isLoaded, tripId, tripSecret]);

  // ── 推送到 Supabase ──
  // 所有寫入只走 server-revision CAS RPC。刻意沒有直接表寫入 fallback：
  // fallback 會繞過 CAS、重新引入 full-snapshot lost update，必須 fail closed。
  useEffect(() => {
    if (!pushReady.current || !isLoaded || !supabase.current || !tripId) return;
    if (!isOnlineRef.current || syncStatus !== "online") return;
    // 只在有待上送變更時推（避免初次 hydrate / 遠端套用後無意義覆寫雲端）
    if (!pendingPushRef.current) return;

    const push = async () => {
      if (!pushReady.current || !pendingPushRef.current) return;
      if (!supabase.current || !isOnlineRef.current || syncStatus !== "online") return;

      const secret = (tripSecretRef.current || tripSecret || "").trim();
      const activeTripId = tripId.trim();
      if (activeTripIdRef.current !== activeTripId) return;
      // Existing legacy rows may use short credentials; new-row entropy is
      // enforced atomically by the server RPC.
      if (!activeTripId || activeTripId.length < 1 || !secret || secret.length < 1) {
        console.warn("[Sync] push skipped: invalid trip credentials");
        pendingPushRef.current = true;
        setSyncStatus("error");
        setSyncError("上傳變更失敗: 行程憑證無效（缺少 trip_id 或 secret）");
        return;
      }

      // login / secret rotation 已負責建立帶雙憑證 header 的 client。
      const client = supabase.current;
      if (!client) return;
      const isCurrentCredential = () =>
        activeTripIdRef.current === activeTripId &&
        tripSecretRef.current.trim() === secret;

      const markPushOk = (
        result: Record<string, unknown>,
        attemptedSlices: SyncSlice[],
        pushVersion: number,
      ) => {
        if (!isCurrentCredential()) return;
        const revision = Number(result.revision);
        const ts = typeof result.updated_at === "string"
          ? new Date(result.updated_at).getTime()
          : Number.NaN;
        if (!Number.isSafeInteger(revision) || revision < 0 || !Number.isFinite(ts)) {
          markPushFail("伺服器回傳無效的同步版本");
          return;
        }
        remoteRevisionRef.current = revision;
        remoteUpdatedAtRef.current = ts;
        if (stateVersionRef.current === pushVersion) {
          for (const slice of attemptedSlices) dirtySlicesRef.current.delete(slice);
          pendingPushRef.current = dirtySlicesRef.current.size > 0;
          if (!pendingPushRef.current) {
            localUpdatedAtRef.current = 0;
            legacyMigrationRef.current = false;
          }
        } else {
          pendingPushRef.current = true;
        }
        persistCurrentCache();
        setIsShareReady(true);
        setSyncStatus("online");
        setSyncError(null);
        if (pendingPushRef.current) setPushTick((tick) => tick + 1);
      };

      const markPushFail = (msg: string) => {
        if (!isCurrentCredential()) return;
        console.warn("[Sync] push failed:", msg);
        pendingPushRef.current = true;
        persistCurrentCache();
        setSyncStatus((prev) => (prev === "offline" ? prev : "error"));
        const friendly =
          /row-level security|forbidden|42501|permission denied|USING expression/i.test(msg)
            ? "上傳變更失敗: 行程密碼不符或已在其他裝置輪換。請用最新分享連結重新進入。"
            : /PGRST202|Could not find the function|schema cache|does not exist/i.test(msg)
              ? "上傳變更失敗: 同步服務尚未完成安全升級，已停止寫入以保護資料。"
            : "上傳變更失敗: " + msg;
        setSyncError(friendly);
      };

      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
        if (
          !isCurrentCredential() ||
          !pendingPushRef.current ||
          !isOnlineRef.current
        ) return;

        const snap = stateRef.current;
        const attemptedSlices = [...dirtySlicesRef.current];
        const pushVersion = stateVersionRef.current;
        const rpcArgs: Record<string, unknown> = {
          p_trip_id: activeTripId,
          p_trip_secret: secret,
          p_expected_revision: remoteRevisionRef.current,
          p_dirty_slices: attemptedSlices,
        };
        if (attemptedSlices.includes("itinerary")) rpcArgs.p_itinerary = snap.itinerary;
        if (attemptedSlices.includes("budgetLimit")) rpcArgs.p_budget_limit = snap.budgetLimit;
        if (attemptedSlices.includes("budgetItems")) rpcArgs.p_budget_items = snap.budgetItems;
        if (attemptedSlices.includes("customFoods")) rpcArgs.p_custom_foods = snap.customFoods;
        if (attemptedSlices.includes("packingList")) rpcArgs.p_packing_list = snap.packingList;

        const rpcRes = await client.rpc("sync_trip_slices", rpcArgs);
        if (!isCurrentCredential()) return;
        if (rpcRes.error) {
          markPushFail(rpcRes.error.message || "同步 RPC 失敗");
          return;
        }

        const result = rpcRes.data && typeof rpcRes.data === "object"
          ? rpcRes.data as Record<string, unknown>
          : {};
        if (result.conflict === true) {
          // Another device won the same revision. Pull through the credential-
          // bound SELECT, preserve our dirty slices, then retry against the new
          // revision. Neither device's wall clock participates in this merge.
          const refreshed = await fetchSyncRecord(client, activeTripId);
          if (refreshed.error) {
            markPushFail("同步衝突後重新讀取失敗: " + refreshed.error.message);
            return;
          }
          if (!refreshed.data) {
            markPushFail("同步衝突後找不到行程，可能已輪換密碼");
            return;
          }
          const refreshedRevision = Number(refreshed.data.revision ?? 0);
          const parsedTs = refreshed.data.updated_at
            ? new Date(refreshed.data.updated_at).getTime()
            : 0;
          if (!Number.isSafeInteger(refreshedRevision) || refreshedRevision < 0) {
            markPushFail("同步衝突後收到無效版本");
            return;
          }
          applyRemoteSnapshot(
            refreshed.data,
            refreshedRevision,
            Number.isFinite(parsedTs) ? parsedTs : 0,
            true,
          );
          continue;
        }
        if (result.ok !== true) {
          markPushFail("伺服器拒絕寫入");
          return;
        }
        markPushOk(result, attemptedSlices, pushVersion);
        return;
      }

      markPushFail(`同步衝突重試 ${MAX_SYNC_ATTEMPTS} 次仍未成功，已保留本機變更`);
    };

    const timer = setTimeout(push, 2000);
    return () => clearTimeout(timer);
  }, [
    itinerary,
    budgetLimit,
    budgetItems,
    customFoods,
    packingList,
    isLoaded,
    tripId,
    tripSecret,
    pushTick,
    syncStatus,
    persistCurrentCache,
    applyRemoteSnapshot,
  ]);

  const loginToTrip = async (id: string, secret: string) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return false;

    const trimmedId = id.trim();
    const trimmedSecret = secret.trim();
    if (!credentialsAreSupported(trimmedId, trimmedSecret)) return false;
    const loginAttempt = ++loginAttemptRef.current;

    // 暫停既有行程的 debounce push；驗證失敗時會恢復，不丟掉原本的 pending 狀態。
    pushReady.current = false;

    try {
      // 用帶 secret header 的 client 查詢（RLS 需要）
      const client = createTripClient(trimmedId, trimmedSecret);
      const { data, error } = await fetchSyncRecord(client, trimmedId);

      if (loginAttemptRef.current !== loginAttempt) return false;

      if (error) {
        console.warn("[Sync] login query failed:", error.message);
        pushReady.current = true;
        if (pendingPushRef.current) setPushTick((tick) => tick + 1);
        return false;
      }

      if (!data) {
        console.warn("[Sync] login failed: trip not found or secret rejected");
        pushReady.current = true;
        if (pendingPushRef.current) setPushTick((tick) => tick + 1);
        setSyncError("找不到此行程，或同步密碼不正確。");
        return false;
      }

      // 切換 client / 憑證
      supabase.current = client;
      tripSecretRef.current = trimmedSecret;

      writeStorage(STORAGE_KEYS.tripId, trimmedId);
      writeStorage(STORAGE_KEYS.tripSecret, trimmedSecret);
      activeTripIdRef.current = trimmedId;
      setTripId(trimmedId);
      setTripSecret(trimmedSecret);
      setSyncStatus("connecting");
      setIsShareReady(false);

      // 先切到這個 trip 自己的 cache，絕不沿用前一趟行程 A 的 state。
      const cached = readTripCache(localStorage, trimmedId);
      stateRef.current = cached.snapshot;
      dirtySlicesRef.current = new Set(cached.dirtySlices);
      remoteRevisionRef.current = cached.remoteRevision;
      remoteUpdatedAtRef.current = cached.remoteUpdatedAt;
      localUpdatedAtRef.current = cached.localUpdatedAt;
      legacyMigrationRef.current = cached.legacyMigration;
      pendingPushRef.current = cached.dirtySlices.length > 0;
      stateVersionRef.current += 1;
      _setItinerary(cached.snapshot.itinerary);
      _setBudgetItems(cached.snapshot.budgetItems);
      _setBudgetLimit(cached.snapshot.budgetLimit);
      _setCustomFoods(cached.snapshot.customFoods);
      _setPackingList(cached.snapshot.packingList);
      persistCurrentCache();

      // 已用同一個 secret 驗證過 data，直接交給 connect 套用，避免第二次
      // SELECT 失敗後出現「畫面已切 B、函式卻回登入失敗」的非原子狀態。
      await connectToTrip(
        trimmedId,
        trimmedSecret,
        client,
        true,
        data as SyncRecord,
      );
      return loginAttemptRef.current === loginAttempt && activeTripIdRef.current === trimmedId;
    } catch {
      if (loginAttemptRef.current !== loginAttempt) return false;
      pushReady.current = true;
      if (pendingPushRef.current) setPushTick((tick) => tick + 1);
      return false;
    }
  };

  const resolveNext = <T,>(arg: SetStateArg<T>, prev: T): T =>
    typeof arg === "function" ? (arg as (p: T) => T)(prev) : arg;

  const setItinerary = (val: SetStateArg<Itinerary>) => {
    const next = resolveNext(val, stateRef.current.itinerary);
    stateRef.current = { ...stateRef.current, itinerary: next };
    _setItinerary(next);
    markLocalMutation("itinerary");
  };
  const setBudgetItems = (val: SetStateArg<BudgetItem[]>) => {
    const next = resolveNext(val, stateRef.current.budgetItems);
    stateRef.current = { ...stateRef.current, budgetItems: next };
    _setBudgetItems(next);
    markLocalMutation("budgetItems");
  };
  const setBudgetLimit = (val: SetStateArg<number>) => {
    const next = resolveNext(val, stateRef.current.budgetLimit);
    stateRef.current = { ...stateRef.current, budgetLimit: next };
    _setBudgetLimit(next);
    markLocalMutation("budgetLimit");
  };
  const setCustomFoods = (val: SetStateArg<CustomFood[]>) => {
    const next = resolveNext(val, stateRef.current.customFoods);
    stateRef.current = { ...stateRef.current, customFoods: next };
    _setCustomFoods(next);
    markLocalMutation("customFoods");
  };
  const setPackingList = (val: SetStateArg<PackingItem[]>) => {
    const next = resolveNext(val, stateRef.current.packingList);
    stateRef.current = { ...stateRef.current, packingList: next };
    _setPackingList(next);
    markLocalMutation("packingList");
  };

  /**
   * 分享連結使用 hash fragment 承載 secret：
   *   https://host/#trip=...&secret=...
   * hash 不會送到 server，也較不易進 Referer。
   * 開啟後會被 scrubCredentialsFromUrl 清掉。
   */
  const getShareLink = () => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.origin + window.location.pathname);
    url.hash = new URLSearchParams({
      trip: tripId,
      secret: tripSecret,
    }).toString();
    return url.toString();
  };

  /**
   * 輪換 trip_secret：
   * 1) 呼叫 SECURITY DEFINER RPC（驗證 old secret 後寫入 new secret）
   * 2) 本地換成新 client / localStorage
   * 3) 舊分享連結立即失效
   *
   * rotation RPC 會同步增加 server revision，讓其他裝置的 CAS 立刻失效。
   */
  const rotateTripSecret = async (): Promise<{ ok: boolean; newSecret?: string; error?: string }> => {
    if (!tripId || !tripSecret) {
      return { ok: false, error: "尚未建立行程憑證" };
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      // 純本機模式沒有遠端 row，可安全輪換本機憑證。
      const offlineSecret = generateTripSecret();
      writeStorage(STORAGE_KEYS.tripSecret, offlineSecret);
      tripSecretRef.current = offlineSecret;
      setTripSecret(offlineSecret);
      return { ok: true, newSecret: offlineSecret };
    }
    if (!supabase.current || syncStatus !== "online" || !isOnlineRef.current) {
      return { ok: false, error: "請連線成功後再重設同步密碼，避免遠端與本機憑證失去同步。" };
    }

    const newSecret = generateTripSecret();
    const oldSecret = tripSecret;
    const client = supabase.current;

    try {
      setSyncStatus("connecting");

      const { data, error } = await client.rpc("rotate_trip_secret", {
        p_trip_id: tripId,
        p_old_secret: oldSecret,
        p_new_secret: newSecret,
      });

      if (error) {
        setSyncStatus("error");
        return { ok: false, error: error.message || "輪換失敗" };
      }

      // RPC 可能回 jsonb { ok: false }（理論上會 raise；此處再保險）
      if (data && typeof data === "object" && "ok" in (data as object) && (data as { ok?: boolean }).ok === false) {
        setSyncStatus("error");
        return { ok: false, error: "輪換被拒絕" };
      }

      const newClient = createTripClient(tripId, newSecret);
      supabase.current = newClient;
      tripSecretRef.current = newSecret;
      writeStorage(STORAGE_KEYS.tripSecret, newSecret);
      setTripSecret(newSecret);
      setIsShareReady(true);

      // Authenticated pull obtains the server-issued revision/timestamp and
      // preserves any local dirty slices before their next CAS write.
      await connectToTrip(tripId, newSecret, newClient, true);
      return { ok: true, newSecret };
    } catch (err) {
      // 失敗時盡量維持舊 secret 可用
      tripSecretRef.current = oldSecret;
      setSyncStatus("error");
      return {
        ok: false,
        error: err instanceof Error ? err.message : "輪換失敗",
      };
    }
  };

  return (
    <TripContext.Provider
      value={{
        isLoaded,
        syncStatus,
        syncError,
        isShareReady,
        itinerary,
        budgetItems,
        budgetLimit,
        customFoods,
        packingList,
        tripId,
        tripSecret,
        setItinerary,
        setBudgetItems,
        setBudgetLimit,
        setCustomFoods,
        setPackingList,
        loginToTrip,
        rotateTripSecret,
        getShareLink,
      }}
    >
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) throw new Error("useTrip must be used within a TripProvider");
  return context;
}
