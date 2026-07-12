"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_TRIP_SNAPSHOT,
  type SyncSlice,
  type TripSnapshot,
  mergeRemoteSnapshot,
  readTripCache,
  remoteRecordToSnapshot,
  writeTripCache,
} from "@/lib/trip-cache";
import { generateTripId, generateTripSecret } from "@/lib/secure-id";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

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

/** 建立帶 x-trip-secret header 的 Supabase client（配合 RLS） */
function createTripClient(secret: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    global: {
      headers: {
        "x-trip-secret": secret,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * 從 URL 解析行程憑證。
 * 優先 hash（#trip=...&secret=...，不會進 server / Referer），
 * 相容舊版 query（?trip=&secret=）。
 */
function parseCredentialsFromLocation(): { tripId: string; secret: string; source: "hash" | "query" } | null {
  if (typeof window === "undefined") return null;

  const hashRaw = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;
  const hashParams = new URLSearchParams(hashRaw);
  const hashTrip = hashParams.get("trip");
  const hashSecret = hashParams.get("secret");
  if (hashTrip && hashSecret) {
    return { tripId: hashTrip.trim(), secret: hashSecret.trim(), source: "hash" };
  }

  const query = new URLSearchParams(window.location.search);
  const queryTrip = query.get("trip");
  const querySecret = query.get("secret");
  if (queryTrip && querySecret) {
    return { tripId: queryTrip.trim(), secret: querySecret.trim(), source: "query" };
  }

  return null;
}

/** 清掉 URL 上的 secret（query / 保留乾淨路徑），避免殘留在歷史紀錄過久 */
function scrubCredentialsFromUrl() {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("trip");
    url.searchParams.delete("secret");
    url.hash = "";
    window.history.replaceState({}, "", url.pathname + url.search);
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
};

type SyncRecord = SyncSnapshot & {
  trip_id?: string;
  trip_secret?: string;
};

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
  const lastUpdateRef = useRef(0);
  const remoteUpdatedAtRef = useRef(0);
  const localUpdatedAtRef = useRef(0);
  const activeTripIdRef = useRef("");
  const dirtySlicesRef = useRef<Set<SyncSlice>>(new Set());
  const legacyMigrationRef = useRef(false);
  const stateVersionRef = useRef(0);
  const realtimeChannel = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const realtimeClientRef = useRef<SupabaseClient | null>(null);
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
    remoteUpdatedAtRef.current = remoteTs;
    stateVersionRef.current += 1;
    if (preserveDirty) {
      lastUpdateRef.current = Math.max(remoteTs, localUpdatedAtRef.current);
      pendingPushRef.current = dirtySlicesRef.current.size > 0;
    } else {
      lastUpdateRef.current = remoteTs;
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
    lastUpdateRef.current = now;
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
      forceReconnect = false,
      expectExisting = false,
      preloadedData?: SyncRecord,
    ): Promise<boolean> => {
      const trimmedId = id.trim();
      const trimmedSecret = secret.trim();
      if (!forceReconnect && realtimeChannel.current) {
        return true;
      }
      const connectionGeneration = ++connectionGenerationRef.current;
      if (realtimeChannel.current) {
        (realtimeClientRef.current ?? client).removeChannel(realtimeChannel.current);
        realtimeChannel.current = null;
        realtimeClientRef.current = null;
      }

      try {
        let data: SyncRecord | null = preloadedData ?? null;
        let queryError: { message: string } | null = null;
        if (!preloadedData) {
          const result = await client
            .from("sync_state")
            .select("*")
            .eq("trip_id", trimmedId)
            .maybeSingle();
          data = result.data as SyncRecord | null;
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
          // 雙重確認 secret（RLS 已擋，這裡是 defense-in-depth）
          if (data.trip_secret && data.trip_secret !== trimmedSecret) {
            console.warn("[Sync] Secret mismatch");
            setSyncStatus("error");
            setSyncError("行程密碼不符 (Secret mismatch)");
            pushReady.current = true;
            return false;
          }
          setIsShareReady(true);

          const parsedRemoteTs = data.updated_at ? new Date(data.updated_at).getTime() : 0;
          const remoteTs = Number.isFinite(parsedRemoteTs) ? parsedRemoteTs : 0;
          const hasDirtySlices = dirtySlicesRef.current.size > 0;
          if (
            hasDirtySlices &&
            legacyMigrationRef.current &&
            remoteTs >= localUpdatedAtRef.current
          ) {
            // 舊版全域快取沿用既有 LWW：遠端較新時不可把舊資料誤當離線編輯。
            applyRemoteSnapshot(data as SyncSnapshot, remoteTs);
          } else if (hasDirtySlices) {
            // 離線期間只保留實際改過的 slice；其餘採用較新的遠端資料，避免整包互蓋。
            if (remoteTs > remoteUpdatedAtRef.current) {
              applyRemoteSnapshot(data as SyncSnapshot, remoteTs, true);
            }
            pendingPushRef.current = true;
          } else {
            if (remoteTs >= remoteUpdatedAtRef.current) {
              applyRemoteSnapshot(data as SyncSnapshot, remoteTs);
            }
          }
        } else {
          setIsShareReady(false);
          if (expectExisting || remoteUpdatedAtRef.current > 0) {
            setSyncStatus("error");
            setSyncError("找不到此行程，或同步密碼不正確。");
            pushReady.current = true;
            return false;
          }
          // 雲端尚無此行程：建立 row，讓尚未編輯的空白行程也能被分享。
          pendingPushRef.current = true;
        }

        const channel = client
          .channel(`trip:${trimmedId}`)
          .on(
            "postgres_changes",
            { event: "*", schema: "public", table: "sync_state", filter: `trip_id=eq.${trimmedId}` },
            (payload) => {
              if (activeTripIdRef.current !== trimmedId) return;
              if (!payload.new || typeof payload.new !== "object" || !("updated_at" in payload.new)) return;
              const remoteUpdated = payload.new.updated_at
                ? new Date(payload.new.updated_at as string).getTime()
                : 0;
              if (payload.new.trip_secret === trimmedSecret) {
                if (
                  dirtySlicesRef.current.size > 0 &&
                  remoteUpdated > remoteUpdatedAtRef.current
                ) {
                  applyRemoteSnapshot(payload.new as SyncSnapshot, remoteUpdated, true);
                } else if (
                  dirtySlicesRef.current.size === 0 &&
                  remoteUpdated > lastUpdateRef.current
                ) {
                  applyRemoteSnapshot(payload.new as SyncSnapshot, remoteUpdated);
                }
              }
            },
          )
          .subscribe();

        realtimeChannel.current = channel;
        realtimeClientRef.current = client;
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
      if (initialUrlCredentialsRef.current) {
        scrubCredentialsFromUrl();
      }
    }
    const fromUrl = initialUrlCredentialsRef.current;
    const hasUrlCredentials = Boolean(fromUrl);

    if (fromUrl) {
      initId = fromUrl.tripId.trim();
      initSecret = fromUrl.secret.trim();
    } else if (!initId || !initSecret) {
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
      const cached = readTripCache(localStorage, id, { allowLegacy });
      stateRef.current = cached.snapshot;
      dirtySlicesRef.current = new Set(cached.dirtySlices);
      remoteUpdatedAtRef.current = cached.remoteUpdatedAt;
      localUpdatedAtRef.current = cached.localUpdatedAt;
      legacyMigrationRef.current = cached.legacyMigration;
      pendingPushRef.current = cached.dirtySlices.length > 0;
      lastUpdateRef.current = pendingPushRef.current
        ? Math.max(1, cached.localUpdatedAt)
        : cached.remoteUpdatedAt;
      _setItinerary(cached.snapshot.itinerary);
      _setBudgetItems(cached.snapshot.budgetItems);
      _setBudgetLimit(cached.snapshot.budgetLimit);
      _setCustomFoods(cached.snapshot.customFoods);
      _setPackingList(cached.snapshot.packingList);
      persistCurrentCache();
    };

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
    const client = createTripClient(activeTripSecret);
    supabase.current = client;

    connectToTrip(activeTripId, activeTripSecret, client, false, hasUrlCredentials).then(async (connected) => {
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
        const previousClient = createTripClient(previousStoredSecret);
        supabase.current = previousClient;
        setSyncStatus("connecting");
        await connectToTrip(previousStoredId, previousStoredSecret, previousClient, true);
        if (cancelled) return;
      }
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      connectionGenerationRef.current += 1;
      if (realtimeChannel.current) {
        (realtimeClientRef.current ?? client).removeChannel(realtimeChannel.current);
        realtimeChannel.current = null;
        realtimeClientRef.current = null;
      }
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
        // 重連後 connectToTrip 會比較 LWW，並在 pending 時 flush
        void connectToTrip(tripId, tripSecretRef.current || tripSecret, supabase.current, true);
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

  // Supabase Realtime WebSocket 不會攜帶 REST 的自訂 x-trip-secret header；
  // 目前 RLS 因此不能只依賴 postgres_changes。可見頁面每 30 秒、回到分頁
  // 或重新聚焦時，用帶 secret header 的 REST SELECT 補抓跨裝置更新。
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
        true,
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
  // 優先 SECURITY DEFINER RPC `upsert_sync_state`；
  // 若 RPC 尚未部署（PGRST202）則 fallback：UPDATE → 必要時 INSERT。
  // 避免 PostgREST .upsert 在 secret 不符時回模糊的 "new row violates RLS"。
  useEffect(() => {
    if (!pushReady.current || !isLoaded || !supabase.current || !tripId) return;
    if (!isOnlineRef.current || syncStatus !== "online") return;
    // 只在有待上送變更時推（避免初次 hydrate / 遠端套用後無意義覆寫雲端）
    if (!pendingPushRef.current) return;

    const push = async () => {
      if (!pushReady.current || !pendingPushRef.current) return;
      if (!supabase.current || !isOnlineRef.current || syncStatus !== "online") return;

      const snap = stateRef.current;
      const pushVersion = stateVersionRef.current;
      const secret = (tripSecretRef.current || tripSecret || "").trim();
      const activeTripId = tripId.trim();
      if (activeTripIdRef.current !== activeTripId) return;
      // 最小長度：非空即可（DB/RPC 同步放寬；自動產生的 secret 仍為長字串）
      if (!activeTripId || activeTripId.length < 1 || !secret || secret.length < 1) {
        console.warn("[Sync] push skipped: invalid trip credentials");
        pendingPushRef.current = true;
        setSyncStatus("error");
        setSyncError("上傳變更失敗: 行程憑證無效（缺少 trip_id 或 secret）");
        return;
      }

      // login / secret rotation 已負責建立正確 header 的 client；push 不可另建
      // client，否則 realtime channel 會失去原本的 owner，後續無法精準移除。
      const client = supabase.current;
      if (!client) return;

      const now = new Date().toISOString();
      const payload = {
        id: "state_" + activeTripId,
        trip_id: activeTripId,
        trip_secret: secret,
        itinerary: snap.itinerary,
        budget_limit: snap.budgetLimit,
        budget_items: snap.budgetItems,
        custom_foods: snap.customFoods,
        packing_list: snap.packingList,
        updated_at: now,
      };

      const markPushOk = () => {
        if (activeTripIdRef.current !== activeTripId) return;
        const ts = new Date(now).getTime();
        remoteUpdatedAtRef.current = ts;
        if (stateVersionRef.current === pushVersion) {
          lastUpdateRef.current = ts;
          localUpdatedAtRef.current = 0;
          dirtySlicesRef.current.clear();
          pendingPushRef.current = false;
          legacyMigrationRef.current = false;
        } else {
          lastUpdateRef.current = Math.max(ts, localUpdatedAtRef.current);
          pendingPushRef.current = true;
          setPushTick((tick) => tick + 1);
        }
        persistCurrentCache();
        setIsShareReady(true);
        setSyncStatus("online");
        setSyncError(null);
      };

      const markPushFail = (msg: string) => {
        if (activeTripIdRef.current !== activeTripId) return;
        console.warn("[Sync] push failed:", msg);
        pendingPushRef.current = true;
        persistCurrentCache();
        setSyncStatus((prev) => (prev === "offline" ? prev : "error"));
        const friendly =
          /row-level security|forbidden|42501|permission denied|USING expression/i.test(msg)
            ? "上傳變更失敗: 行程密碼不符或已在其他裝置輪換。請用最新分享連結重新進入。"
            : "上傳變更失敗: " + msg;
        setSyncError(friendly);
      };

      // 1) 優先 RPC（migration 套用後最穩）
      const rpcRes = await client.rpc("upsert_sync_state", {
        p_trip_id: activeTripId,
        p_trip_secret: secret,
        p_itinerary: snap.itinerary,
        p_budget_limit: snap.budgetLimit,
        p_budget_items: snap.budgetItems,
        p_custom_foods: snap.customFoods,
        p_packing_list: snap.packingList,
        p_updated_at: now,
      });

      if (!rpcRes.error) {
        if (
          rpcRes.data &&
          typeof rpcRes.data === "object" &&
          "ok" in (rpcRes.data as object) &&
          (rpcRes.data as { ok?: boolean }).ok === false
        ) {
          markPushFail("伺服器拒絕寫入");
          return;
        }
        markPushOk();
        return;
      }

      const rpcMsg = rpcRes.error.message || "";
      const rpcMissing =
        /Could not find the function|PGRST202|schema cache|does not exist/i.test(rpcMsg);

      // 權限類：不要再嘗試直連寫入（會得到更模糊的 RLS 訊息）
      if (!rpcMissing && /forbidden|42501|permission denied|row-level security/i.test(rpcMsg)) {
        markPushFail(rpcMsg);
        return;
      }

      if (!rpcMissing) {
        // 其他 RPC 錯誤仍嘗試 fallback
        console.warn("[Sync] upsert_sync_state RPC error, trying table write:", rpcMsg);
      } else {
        console.warn("[Sync] upsert_sync_state RPC not deployed, using UPDATE/INSERT fallback");
      }

      // 2) Fallback：先 UPDATE（既有列 + 正確 secret）
      const updateRes = await client
        .from("sync_state")
        .update({
          itinerary: payload.itinerary,
          budget_limit: payload.budget_limit,
          budget_items: payload.budget_items,
          custom_foods: payload.custom_foods,
          packing_list: payload.packing_list,
          updated_at: payload.updated_at,
          // 不改 trip_secret，避免踩 rotation WITH CHECK 邊界
        })
        .eq("trip_id", activeTripId)
        .select("trip_id");

      if (updateRes.error) {
        markPushFail(updateRes.error.message);
        return;
      }
      if (updateRes.data && updateRes.data.length > 0) {
        markPushOk();
        return;
      }

      // 3) 無列可更新：INSERT 新行程
      const insertRes = await client.from("sync_state").insert(payload).select("trip_id");
      if (!insertRes.error && insertRes.data && insertRes.data.length > 0) {
        markPushOk();
        return;
      }

      // INSERT 失敗常見原因：
      // - secret 不符既有列（SELECT 看不到 → 誤當新列 → 衝突/RLS）
      // - 無 header / 長度不足
      // 再試一次帶 onConflict 的 upsert 作為最後手段
      if (insertRes.error) {
        const up = await client
          .from("sync_state")
          .upsert(payload, { onConflict: "id" })
          .select("trip_id");
        if (!up.error && up.data && up.data.length > 0) {
          markPushOk();
          return;
        }
        markPushFail(up.error?.message || insertRes.error.message);
        return;
      }

      markPushFail("寫入未生效（可能密碼不符）");
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
  ]);

  const loginToTrip = async (id: string, secret: string) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return false;

    const trimmedId = id.trim();
    const trimmedSecret = secret.trim();
    if (!trimmedId || !trimmedSecret) return false;
    const loginAttempt = ++loginAttemptRef.current;

    // 暫停既有行程的 debounce push；驗證失敗時會恢復，不丟掉原本的 pending 狀態。
    pushReady.current = false;

    try {
      // 用帶 secret header 的 client 查詢（RLS 需要）
      const client = createTripClient(trimmedSecret);
      const { data, error } = await client.from("sync_state").select("*").eq("trip_id", trimmedId).maybeSingle();

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

      // 有資料但 secret 不符（理論上 RLS 已擋，這裡再保險）
      if (data && data.trip_secret && data.trip_secret !== trimmedSecret) {
        console.warn("代號已存在，但密碼錯誤！");
        pushReady.current = true;
        if (pendingPushRef.current) setPushTick((tick) => tick + 1);
        return false;
      }

      // 切換 client / 憑證
      if (realtimeChannel.current && supabase.current) {
        (realtimeClientRef.current ?? supabase.current).removeChannel(realtimeChannel.current);
        realtimeChannel.current = null;
        realtimeClientRef.current = null;
      }
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
      remoteUpdatedAtRef.current = cached.remoteUpdatedAt;
      localUpdatedAtRef.current = cached.localUpdatedAt;
      legacyMigrationRef.current = cached.legacyMigration;
      pendingPushRef.current = cached.dirtySlices.length > 0;
      lastUpdateRef.current = pendingPushRef.current
        ? Math.max(1, cached.localUpdatedAt)
        : cached.remoteUpdatedAt;
      stateVersionRef.current += 1;
      _setItinerary(cached.snapshot.itinerary);
      _setBudgetItems(cached.snapshot.budgetItems);
      _setBudgetLimit(cached.snapshot.budgetLimit);
      _setCustomFoods(cached.snapshot.customFoods);
      _setPackingList(cached.snapshot.packingList);
      persistCurrentCache();

      // 已用同一個 secret 驗證過 data，直接交給 connect 建立訂閱，避免第二次
      // SELECT 失敗後出現「畫面已切 B、函式卻回登入失敗」的非原子狀態。
      await connectToTrip(
        trimmedId,
        trimmedSecret,
        client,
        true,
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
   * 注意：不可用 upsert 直接改 trip_secret——
   * PostgREST + FORCE RLS 下會踩 INSERT/UPDATE WITH CHECK。
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

      const now = new Date().toISOString();
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

      // 切斷舊 realtime，改用新 secret 的 client
      if (realtimeChannel.current) {
        (realtimeClientRef.current ?? client).removeChannel(realtimeChannel.current);
        realtimeChannel.current = null;
        realtimeClientRef.current = null;
      }

      const newClient = createTripClient(newSecret);
      supabase.current = newClient;
      tripSecretRef.current = newSecret;
      writeStorage(STORAGE_KEYS.tripSecret, newSecret);
      setTripSecret(newSecret);
      setIsShareReady(true);
      remoteUpdatedAtRef.current = new Date(now).getTime();
      lastUpdateRef.current = pendingPushRef.current
        ? Math.max(remoteUpdatedAtRef.current, localUpdatedAtRef.current)
        : remoteUpdatedAtRef.current;
      persistCurrentCache();

      await connectToTrip(tripId, newSecret, newClient, true, true);
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
