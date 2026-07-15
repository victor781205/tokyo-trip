"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  EMPTY_TRIP_SNAPSHOT,
  addRevisionToHistory,
  ensureStableEntityIds,
  type SyncSlice,
  type TripSnapshot,
  type TripProfile,
  type TripRevision,
  mergeSnapshotsThreeWay,
  migrateLegacyTripCache,
  parseRemoteRecordToSnapshot,
  readTripProfiles,
  readTripCache,
  upsertTripProfile,
  writeTripCache,
} from "@/lib/trip-cache";
import { generateTripId, generateTripSecret } from "@/lib/secure-id";
import {
  clearPendingShareCredential,
  readPendingShareCredential,
  rememberPendingShareCredential,
  tripCredentialsAreSupported,
  type TripCredentials,
} from "@/lib/trip-credentials";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";
const SYNC_SELECT_COLUMNS = [
  "itinerary",
  "budget_limit",
  "budget_items",
  "custom_foods",
  "packing_list",
  "food_statuses",
  "updated_at",
  "revision",
].join(",");
const MAX_SYNC_ATTEMPTS = 3;
const INITIAL_REMOTE_TIMEOUT_MS = 8_000;
const ROTATION_PENDING_KEY = "tokyoTripPendingRotation:v1";
const SYNC_CHANNEL = "tokyo-trip-sync:v1";

function wallClockNow() {
  return Date.now();
}

// ── localStorage 鍵名常數 ──
const STORAGE_KEYS = {
  tripId: "tokyoTripId",
  tripSecret: "tokyoTripSecret",
} as const;

export type Activity = {
  syncId?: string;
  sourceId?: string;
  status?: "done" | "skipped";
  time: string;
  name: string;
  desc: string;
  tag: string;
};
export type DayPlan = { title: string; date: string; activities: Activity[] };
export type Itinerary = Record<string, DayPlan>;
export type BudgetItem = {
  id: number;
  syncId?: string;
  name: string;
  amount: number;
  category: string;
  date: string;
  payer?: string;
  participants?: string[];
};
export type CustomFood = {
  id: number;
  syncId?: string;
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
export type SaveStatus = "pending" | "saving" | "synced" | "error";
export type FoodStatus = "wishlist" | "visited";

type SetStateArg<T> = T | ((prev: T) => T);

interface TripContextType {
  isLoaded: boolean;
  syncStatus: SyncStatus;
  saveStatus: SaveStatus;
  syncError: string | null;
  pendingSliceCount: number;
  lastSyncedAt: number | null;
  storageError: string | null;
  isShareReady: boolean;
  itinerary: Itinerary;
  budgetItems: BudgetItem[];
  budgetLimit: number;
  customFoods: CustomFood[];
  packingList: PackingItem[];
  foodStatuses: Record<string, FoodStatus>;
  tripId: string;
  tripSecret: string;
  setItinerary: (itin: SetStateArg<Itinerary>) => void;
  setBudgetItems: (items: SetStateArg<BudgetItem[]>) => void;
  setBudgetLimit: (limit: SetStateArg<number>) => void;
  setCustomFoods: (foods: SetStateArg<CustomFood[]>) => void;
  setPackingList: (list: SetStateArg<PackingItem[]>) => void;
  setFoodStatuses: (statuses: SetStateArg<Record<string, FoodStatus>>) => void;
  loginToTrip: (id: string, secret: string) => Promise<boolean>;
  /** 輪換目前行程的同步密碼；舊分享連結立刻失效 */
  rotateTripSecret: () => Promise<{ ok: boolean; newSecret?: string; error?: string }>;
  retrySync: () => Promise<boolean>;
  flushSync: () => Promise<boolean>;
  exportBackup: () => void;
  recentTrips: TripProfile[];
  switchTrip: (id: string) => Promise<boolean>;
  versionHistory: TripRevision[];
  restoreRevision: (revision: number) => boolean;
  hasRevisionRollback: boolean;
  applyAuthoritativeRollback: () => boolean;
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

type PendingRotation = {
  tripId: string;
  oldSecret: string;
  newSecret: string;
  createdAt: number;
};

function readPendingRotation(storage: Storage): PendingRotation | null {
  try {
    const raw = storage.getItem(ROTATION_PENDING_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingRotation>;
    if (
      typeof value.tripId !== "string"
      || typeof value.oldSecret !== "string"
      || typeof value.newSecret !== "string"
      || typeof value.createdAt !== "number"
      || !tripCredentialsAreSupported(value.tripId, value.oldSecret)
      || !tripCredentialsAreSupported(value.tripId, value.newSecret)
    ) return null;
    return value as PendingRotation;
  } catch {
    return null;
  }
}

function writeStorageVerified(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
    return localStorage.getItem(key) === value;
  } catch (err) {
    console.warn("[Sync] verified localStorage write failed:", key, err);
    return false;
  }
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
    if (tripCredentialsAreSupported(tripId, secret)) return { tripId, secret };
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
  food_statuses?: unknown;
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
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("synced");
  const [syncError, setSyncError] = useState<string | null>(null);
  const [pendingSliceCount, setPendingSliceCount] = useState(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [isShareReady, setIsShareReadyState] = useState(false);
  const isShareReadyRef = useRef(false);
  const setIsShareReady = (ready: boolean) => {
    isShareReadyRef.current = ready;
    setIsShareReadyState(ready);
  };
  const [itinerary, _setItinerary] = useState<Itinerary>({});
  const [budgetItems, _setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetLimit, _setBudgetLimit] = useState(100000);
  const [customFoods, _setCustomFoods] = useState<CustomFood[]>([]);
  const [packingList, _setPackingList] = useState<PackingItem[]>([]);
  const [foodStatuses, _setFoodStatuses] = useState<Record<string, FoodStatus>>({});
  const [recentTrips, setRecentTrips] = useState<TripProfile[]>([]);
  const [versionHistory, setVersionHistory] = useState<TripRevision[]>([]);
  const [hasRevisionRollback, setHasRevisionRollback] = useState(false);

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
  const baseSnapshotRef = useRef<TripSnapshot>(EMPTY_TRIP_SNAPSHOT);
  const historyRef = useRef<TripRevision[]>([]);
  const rollbackCandidateRef = useRef<{
    tripId: string;
    raw: SyncSnapshot;
    revision: number;
    timestamp: number;
  } | null>(null);
  const connectionGenerationRef = useRef(0);
  const loginAttemptRef = useRef(0);
  const initialUrlCredentialsRef = useRef<ReturnType<typeof parseCredentialsFromLocation> | undefined>(undefined);
  /** Share-hash credentials stay untrusted until a credential-bound read succeeds. */
  const unverifiedCredentialRef = useRef<TripCredentials | null>(null);
  /** Fail closed only when a scrubbed share credential has no recovery handle or was rejected. */
  const mutationBlockedRef = useRef(false);
  const isOnlineRef = useRef(true);
  /** 有尚未成功上送的本機變更 */
  const pendingPushRef = useRef(false);
  /** 最新 state 快照，供 reconnect flush 使用，避免 stale closure */
  const stateRef = useRef<TripSnapshot>(EMPTY_TRIP_SNAPSHOT);
  const flushRequestedRef = useRef(false);
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const tabIdRef = useRef(generateTripId());

  useEffect(() => {
    stateRef.current = {
      itinerary,
      budgetItems,
      budgetLimit,
      customFoods,
      packingList,
      foodStatuses,
    };
  }, [itinerary, budgetItems, budgetLimit, customFoods, packingList, foodStatuses]);

  const persistCurrentCache = useCallback(() => {
    const id = activeTripIdRef.current;
    if (!id || typeof window === "undefined") return;
    try {
      writeTripCache(localStorage, id, {
        snapshot: stateRef.current,
        baseSnapshot: baseSnapshotRef.current,
        dirtySlices: [...dirtySlicesRef.current],
        remoteRevision: remoteRevisionRef.current,
        remoteUpdatedAt: remoteUpdatedAtRef.current,
        localUpdatedAt: localUpdatedAtRef.current,
        legacyMigration: legacyMigrationRef.current,
        history: historyRef.current,
      });
      setStorageError(null);
    } catch (err) {
      console.warn("[Sync] trip cache write failed:", err);
      setStorageError("無法寫入瀏覽器儲存空間；請先匯出備份，並釋放瀏覽器空間。");
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
    if (!id) return false;
    const parsed = parseRemoteRecordToSnapshot(
      raw as Record<string, unknown>,
      stateRef.current,
    );
    if (!parsed.success) {
      setSyncStatus("error");
      setSaveStatus("error");
      setSyncError(`雲端資料格式異常（${parsed.invalidSlices.join("、")}），已停止套用以保護本機資料。`);
      return false;
    }
    const remoteSnapshot = parsed.snapshot;
    const snapshot = preserveDirty
      ? mergeSnapshotsThreeWay(
        baseSnapshotRef.current,
        stateRef.current,
        remoteSnapshot,
        dirtySlicesRef.current,
      )
      : remoteSnapshot;
    stateRef.current = snapshot;
    _setItinerary(snapshot.itinerary);
    _setBudgetLimit(snapshot.budgetLimit);
    _setBudgetItems(snapshot.budgetItems);
    _setCustomFoods(snapshot.customFoods);
    _setPackingList(snapshot.packingList);
    _setFoodStatuses(snapshot.foodStatuses);
    remoteRevisionRef.current = remoteRevision;
    remoteUpdatedAtRef.current = remoteTs;
    baseSnapshotRef.current = remoteSnapshot;
    historyRef.current = addRevisionToHistory(
      historyRef.current,
      remoteRevision,
      remoteTs || Date.now(),
      remoteSnapshot,
    );
    setVersionHistory(historyRef.current);
    setLastSyncedAt(remoteTs || Date.now());
    stateVersionRef.current += 1;
    if (preserveDirty) {
      pendingPushRef.current = dirtySlicesRef.current.size > 0;
      setPendingSliceCount(dirtySlicesRef.current.size);
      setSaveStatus(pendingPushRef.current ? "pending" : "synced");
    } else {
      localUpdatedAtRef.current = 0;
      dirtySlicesRef.current.clear();
      pendingPushRef.current = false;
      legacyMigrationRef.current = false;
      setPendingSliceCount(0);
      setSaveStatus("synced");
    }
    persistCurrentCache();
    return true;
  }, [persistCurrentCache]);

  /** 本機使用者變更：更新時間戳並標記待推送 */
  const markLocalMutation = useCallback((slice: SyncSlice) => {
    const now = Date.now();
    localUpdatedAtRef.current = now;
    dirtySlicesRef.current.add(slice);
    stateVersionRef.current += 1;
    pendingPushRef.current = true;
    setPendingSliceCount(dirtySlicesRef.current.size);
    setSaveStatus("pending");
    persistCurrentCache();
    broadcastRef.current?.postMessage({
      type: "cache-updated",
      tripId: activeTripIdRef.current,
      source: tabIdRef.current,
      localUpdatedAt: now,
    });
  }, [persistCurrentCache]);

  const promoteVerifiedPendingCredential = useCallback((id: string, secret: string) => {
    const pending = unverifiedCredentialRef.current;
    if (!pending || pending.tripId !== id || pending.tripSecret !== secret) return true;
    const idPersisted = writeStorageVerified(STORAGE_KEYS.tripId, id);
    const secretPersisted = writeStorageVerified(STORAGE_KEYS.tripSecret, secret);
    mutationBlockedRef.current = false;
    if (!idPersisted || !secretPersisted) {
      setStorageError("行程已驗證，但瀏覽器無法持久保存正式憑證；安全復原點會保留。");
      return false;
    }
    unverifiedCredentialRef.current = null;
    clearPendingShareCredential(localStorage, { tripId: id, tripSecret: secret });
    try {
      upsertTripProfile(localStorage, {
        tripId: id,
        tripSecret: secret,
        label: `東京行程 ${id.slice(-6)}`,
        lastUsedAt: wallClockNow(),
      });
      setRecentTrips(readTripProfiles(localStorage));
    } catch (err) {
      setStorageError("行程已驗證，但無法加入最近行程清單。");
      console.warn("[Sync] verified profile write failed:", err);
    }
    return true;
  }, []);

  const rejectPendingCredential = useCallback((id: string, secret: string) => {
    const pending = unverifiedCredentialRef.current;
    if (!pending || pending.tripId !== id || pending.tripSecret !== secret) return;
    clearPendingShareCredential(localStorage, { tripId: id, tripSecret: secret });
    unverifiedCredentialRef.current = null;
    mutationBlockedRef.current = true;
    setIsShareReady(false);
  }, []);

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
      if (!tripCredentialsAreSupported(trimmedId, trimmedSecret)) return false;
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
          if (remoteRevision < remoteRevisionRef.current) {
            rollbackCandidateRef.current = {
              tripId: trimmedId,
              raw: data,
              revision: remoteRevision,
              timestamp: remoteTs,
            };
            setHasRevisionRollback(true);
            setSyncStatus("error");
            setSaveStatus("error");
            setSyncError(
              `偵測到雲端版本倒退（本機 r${remoteRevisionRef.current}／雲端 r${remoteRevision}）。已保留本機資料，請在同步中心確認。`,
            );
            pushReady.current = true;
            return false;
          }
          rollbackCandidateRef.current = null;
          setHasRevisionRollback(false);
          if (hasDirtySlices) {
            // Revision, not either device's clock, decides whether a refetch is
            // newer. Preserve only the locally dirty slices across that pull.
            if (!applyRemoteSnapshot(data as SyncSnapshot, remoteRevision, remoteTs, true)) {
              pushReady.current = true;
              return false;
            }
            pendingPushRef.current = true;
          } else {
            if (remoteRevision >= remoteRevisionRef.current) {
              if (!applyRemoteSnapshot(data as SyncSnapshot, remoteRevision, remoteTs)) {
                pushReady.current = true;
                return false;
              }
            }
          }
        } else {
          setIsShareReady(false);
          const pending = unverifiedCredentialRef.current;
          const isPendingShareCredential = Boolean(
            pending
            && pending.tripId === trimmedId
            && pending.tripSecret === trimmedSecret,
          );
          if (expectExisting || isPendingShareCredential || remoteRevisionRef.current > 0) {
            if (isPendingShareCredential) {
              rejectPendingCredential(trimmedId, trimmedSecret);
            }
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
        promoteVerifiedPendingCredential(trimmedId, trimmedSecret);
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
    [applyRemoteSnapshot, promoteVerifiedPendingCredential, rejectPendingCredential],
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
      const parsedShareCredential = initialUrlCredentialsRef.current;
      if (parsedShareCredential) {
        const recoverable = rememberPendingShareCredential(localStorage, {
          tripId: parsedShareCredential.tripId,
          tripSecret: parsedShareCredential.secret,
        });
        mutationBlockedRef.current = !recoverable;
        if (!recoverable) {
          setStorageError("分享連結尚未驗證，且瀏覽器無法保存安全復原點；驗證完成前已停止編輯。");
        }
      }
      if (locationContainsCredentialKeys()) {
        scrubCredentialsFromUrl();
      }
    }
    const fromUrl = initialUrlCredentialsRef.current;
    const pendingShareCredential = fromUrl
      ? {
          tripId: fromUrl.tripId.trim(),
          tripSecret: fromUrl.secret.trim(),
        }
      : readPendingShareCredential(localStorage);
    const requiresCredentialVerification = Boolean(pendingShareCredential);

    // A pending share takes precedence over the trusted current trip only
    // until its credential-bound read succeeds or is explicitly rejected.
    // This is the recovery path after the original hash has been scrubbed.
    if (pendingShareCredential) {
      initId = pendingShareCredential.tripId;
      initSecret = pendingShareCredential.tripSecret;
    } else if (!initId || !initSecret || !tripCredentialsAreSupported(initId, initSecret)) {
      initId = generateTripId();
      initSecret = generateTripSecret();
    }

    const activeTripId = (initId ?? generateTripId()).trim();
    const activeTripSecret = (initSecret ?? generateTripSecret()).trim();

    // 分享憑證必須先經遠端驗證；不可在驗證前覆寫原本 A 行程的持久憑證。
    if (!requiresCredentialVerification) {
      writeStorage(STORAGE_KEYS.tripId, activeTripId);
      writeStorage(STORAGE_KEYS.tripSecret, activeTripSecret);
    }
    unverifiedCredentialRef.current = requiresCredentialVerification
      ? { tripId: activeTripId, tripSecret: activeTripSecret }
      : null;
    if (!requiresCredentialVerification) mutationBlockedRef.current = false;
    activeTripIdRef.current = activeTripId;
    setTripId(activeTripId);
    setTripSecret(activeTripSecret);
    tripSecretRef.current = activeTripSecret;

    const hydrateCache = (id: string, allowLegacy: boolean) => {
      const cached = allowLegacy
        ? migrateLegacyTripCache(localStorage, id)
        : readTripCache(localStorage, id);
      stateRef.current = cached.snapshot;
      baseSnapshotRef.current = cached.baseSnapshot;
      historyRef.current = cached.history;
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
      _setFoodStatuses(cached.snapshot.foodStatuses);
      setPendingSliceCount(cached.dirtySlices.length);
      setSaveStatus(cached.dirtySlices.length > 0 ? "pending" : "synced");
      setVersionHistory(cached.history);
      setLastSyncedAt(cached.remoteUpdatedAt || null);
      persistCurrentCache();
    };

    // A share link must never cause the previous trip's global legacy cache to
    // be imported into the shared trip on the next reload. Attribute it to the
    // previously stored trip first, then clear globals only after that write.
    if (requiresCredentialVerification && previousStoredId) {
      try {
        migrateLegacyTripCache(localStorage, previousStoredId);
      } catch (err) {
        console.warn("[Sync] legacy cache migration failed before trip switch:", err);
      }
    }

    // 每個 trip 使用獨立 cache；分享連結絕不讀取另一趟行程的舊版全域資料。
    hydrateCache(activeTripId, !requiresCredentialVerification);
    // Local-first hydration: the UI is usable immediately while the remote
    // verification continues in the background.
    setIsLoaded(true);
    try {
      if (!requiresCredentialVerification) {
        upsertTripProfile(localStorage, {
          tripId: activeTripId,
          tripSecret: activeTripSecret,
          label: `東京行程 ${activeTripId.slice(-6)}`,
          lastUsedAt: wallClockNow(),
        });
      }
      setRecentTrips(readTripProfiles(localStorage));
    } catch (err) {
      setStorageError("無法更新最近行程清單；瀏覽器儲存空間可能已滿。");
      console.warn("[Sync] profile index write failed:", err);
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      console.warn("[Sync] Supabase credentials not configured. Running in offline mode.");
      setSyncStatus("offline");
      if (requiresCredentialVerification) {
        setSyncError(
          mutationBlockedRef.current
            ? "分享連結尚未驗證，且安全復原點無法保存；目前已停止編輯。"
            : "分享連結尚未驗證；已保存安全復原點，連線恢復後會繼續驗證。",
        );
      }
      pushReady.current = true;
      setIsLoaded(true);
      return;
    }

    let cancelled = false;
    type InitialVerification = "not-required" | "verified" | "rejected" | "unavailable" | "unsafe";
    type InitialConnectResult = { connected: boolean; verification: InitialVerification };
    const initialConnect = (async (): Promise<InitialConnectResult> => {
      try {
        let resolvedSecret = activeTripSecret;
        let client = createTripClient(activeTripId, resolvedSecret);
        let preloadedData: SyncRecord | undefined;
        const pendingRotation = !requiresCredentialVerification
          ? readPendingRotation(localStorage)
          : null;
        if (pendingRotation?.tripId === activeTripId) {
          // The RPC may have committed even if its HTTP response was lost. Probe
          // the new credential first, then the old one; never guess and lock the
          // user out of both credentials.
          const newClient = createTripClient(activeTripId, pendingRotation.newSecret);
          const withNew = await fetchSyncRecord(newClient, activeTripId);
          if (!withNew.error && withNew.data) {
            resolvedSecret = pendingRotation.newSecret;
            client = newClient;
            preloadedData = withNew.data;
            if (writeStorageVerified(STORAGE_KEYS.tripSecret, resolvedSecret)) {
              localStorage.removeItem(ROTATION_PENDING_KEY);
            } else {
              setStorageError("已找回新的同步密碼，但瀏覽器無法持久保存；復原點會保留，請先匯出備份並釋放空間。");
            }
          } else {
            const oldClient = createTripClient(activeTripId, pendingRotation.oldSecret);
            const withOld = await fetchSyncRecord(oldClient, activeTripId);
            if (!withOld.error && withOld.data) {
              resolvedSecret = pendingRotation.oldSecret;
              client = oldClient;
              preloadedData = withOld.data;
              if (writeStorageVerified(STORAGE_KEYS.tripSecret, resolvedSecret)) {
                localStorage.removeItem(ROTATION_PENDING_KEY);
              } else {
                setStorageError("已確認舊同步密碼仍有效，但瀏覽器無法持久保存；安全復原點會繼續保留。");
              }
            }
          }
        }
        if (cancelled) return { connected: false, verification: "unavailable" };
        supabase.current = client;
        if (resolvedSecret !== tripSecretRef.current) {
          tripSecretRef.current = resolvedSecret;
          setTripSecret(resolvedSecret);
          try {
            upsertTripProfile(localStorage, {
              tripId: activeTripId,
              tripSecret: resolvedSecret,
              label: `東京行程 ${activeTripId.slice(-6)}`,
              lastUsedAt: Date.now(),
            });
            setRecentTrips(readTripProfiles(localStorage));
          } catch {
            setStorageError("已恢復同步密碼，但無法更新最近行程清單。");
          }
        }

        if (requiresCredentialVerification && !preloadedData) {
          const verificationGeneration = connectionGenerationRef.current;
          const probe = await fetchSyncRecord(client, activeTripId);
          if (
            cancelled
            || activeTripIdRef.current !== activeTripId
            || connectionGenerationRef.current !== verificationGeneration
          ) {
            return { connected: false, verification: "unavailable" };
          }
          if (probe.error) {
            console.warn("[Sync] share credential verification unavailable:", probe.error.message);
            setIsShareReady(false);
            setSyncStatus("offline");
            setSyncError(
              "分享連結暫時無法驗證；安全復原點已保留，連線恢復後會自動重試。",
            );
            pushReady.current = true;
            return { connected: false, verification: "unavailable" };
          }
          if (!probe.data) {
            setIsShareReady(false);
            setSyncStatus("error");
            setSyncError("找不到此行程，或同步密碼不正確。");
            pushReady.current = true;
            return { connected: false, verification: "rejected" };
          }
          preloadedData = probe.data;
        }

        const connected = await connectToTrip(
          activeTripId,
          resolvedSecret,
          client,
          requiresCredentialVerification,
          preloadedData,
        );
        return {
          connected,
          verification: requiresCredentialVerification
            ? connected ? "verified" : "unsafe"
            : "not-required",
        };
      } catch (err) {
        if (!cancelled && activeTripIdRef.current === activeTripId) {
          console.warn("[Sync] initial credential verification unavailable:", err);
          setIsShareReady(false);
          setSyncStatus("offline");
          setSyncError(
            requiresCredentialVerification
              ? "分享連結暫時無法驗證；安全復原點已保留，連線恢復後會自動重試。"
              : err instanceof Error ? "連線出錯: " + err.message : "連線發生未知錯誤",
          );
          pushReady.current = true;
        }
        return { connected: false, verification: "unavailable" };
      }
    })();
    const timeoutId = window.setTimeout(() => {
      if (cancelled || activeTripIdRef.current !== activeTripId) return;
      const pending = unverifiedCredentialRef.current;
      if (
        requiresCredentialVerification
        && (!pending || pending.tripId !== activeTripId || pending.tripSecret !== activeTripSecret)
      ) return;
      setSyncStatus("offline");
      setSyncError("雲端連線逾時；已先載入本機資料，恢復連線後會自動重試。");
    }, INITIAL_REMOTE_TIMEOUT_MS);
    initialConnect.then(async ({ connected, verification }) => {
      window.clearTimeout(timeoutId);
      if (cancelled) return;
      if (connected && verification === "verified") {
        promoteVerifiedPendingCredential(activeTripId, activeTripSecret);
      } else if (verification === "rejected") {
        clearPendingShareCredential(localStorage, {
          tripId: activeTripId,
          tripSecret: activeTripSecret,
        });
        unverifiedCredentialRef.current = null;
        mutationBlockedRef.current = true;
        const canRestorePrevious = Boolean(
          previousStoredId
          && previousStoredSecret
          && tripCredentialsAreSupported(previousStoredId, previousStoredSecret)
          && (previousStoredId !== activeTripId || previousStoredSecret !== activeTripSecret),
        );
        if (canRestorePrevious && previousStoredId && previousStoredSecret) {
          // Only a definitive credential rejection restores A. A transport or
          // server outage keeps B plus its unverified recovery record intact.
          rollbackCandidateRef.current = null;
          setHasRevisionRollback(false);
          activeTripIdRef.current = previousStoredId;
          tripSecretRef.current = previousStoredSecret;
          setTripId(previousStoredId);
          setTripSecret(previousStoredSecret);
          hydrateCache(previousStoredId, true);
          const previousClient = createTripClient(previousStoredId, previousStoredSecret);
          supabase.current = previousClient;
          mutationBlockedRef.current = false;
          setSyncStatus("connecting");
          await connectToTrip(previousStoredId, previousStoredSecret, previousClient);
          if (cancelled) return;
        }
      } else if (verification === "unsafe") {
        // The credential resolved to a row, but its snapshot could not be
        // safely applied (for example malformed data or a revision rollback).
        mutationBlockedRef.current = true;
        setIsShareReady(false);
      }
      setIsLoaded(true);
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
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

  // Keep multiple tabs on the same browser coordinated. BroadcastChannel is
  // the fast path; the storage event is a compatibility fallback.
  useEffect(() => {
    if (!isLoaded || !tripId || typeof window === "undefined") return;
    const consumeCache = () => {
      const cached = readTripCache(localStorage, tripId);
      if (cached.localUpdatedAt <= localUpdatedAtRef.current) return;
      const unionDirty = new Set([...dirtySlicesRef.current, ...cached.dirtySlices]);
      const merged = mergeSnapshotsThreeWay(
        baseSnapshotRef.current,
        stateRef.current,
        cached.snapshot,
        unionDirty,
      );
      stateRef.current = merged;
      dirtySlicesRef.current = unionDirty;
      localUpdatedAtRef.current = cached.localUpdatedAt;
      pendingPushRef.current = unionDirty.size > 0;
      _setItinerary(merged.itinerary);
      _setBudgetLimit(merged.budgetLimit);
      _setBudgetItems(merged.budgetItems);
      _setCustomFoods(merged.customFoods);
      _setPackingList(merged.packingList);
      _setFoodStatuses(merged.foodStatuses);
      setPendingSliceCount(unionDirty.size);
      setSaveStatus(unionDirty.size > 0 ? "pending" : "synced");
      persistCurrentCache();
      if (pendingPushRef.current) setPushTick((tick) => tick + 1);
    };

    const channel = typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(SYNC_CHANNEL)
      : null;
    broadcastRef.current = channel;
    if (channel) {
      channel.onmessage = (event: MessageEvent) => {
        const message = event.data as Record<string, unknown> | null;
        if (!message || message.source === tabIdRef.current || message.tripId !== tripId) return;
        if (message.type === "cache-updated") consumeCache();
        if (message.type === "sync-complete" && supabase.current) {
          void connectToTrip(tripId, tripSecretRef.current || tripSecret, supabase.current);
        }
      };
    }
    const handleStorage = (event: StorageEvent) => {
      if (event.key === `tokyoTripCache:${encodeURIComponent(tripId)}`) consumeCache();
    };
    window.addEventListener("storage", handleStorage);
    return () => {
      if (broadcastRef.current === channel) broadcastRef.current = null;
      channel?.close();
      window.removeEventListener("storage", handleStorage);
    };
  }, [connectToTrip, isLoaded, persistCurrentCache, tripId, tripSecret]);

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
        setSaveStatus("error");
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
        pushedSnapshot: TripSnapshot,
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
        baseSnapshotRef.current = {
          ...baseSnapshotRef.current,
          ...Object.fromEntries(attemptedSlices.map((slice) => [slice, pushedSnapshot[slice]])),
        };
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
        historyRef.current = addRevisionToHistory(
          historyRef.current,
          revision,
          ts,
          baseSnapshotRef.current,
        );
        persistCurrentCache();
        setVersionHistory(historyRef.current);
        setLastSyncedAt(ts);
        setPendingSliceCount(dirtySlicesRef.current.size);
        setIsShareReady(true);
        setSyncStatus("online");
        setSaveStatus(pendingPushRef.current ? "pending" : "synced");
        setSyncError(null);
        broadcastRef.current?.postMessage({
          type: "sync-complete",
          tripId: activeTripId,
          source: tabIdRef.current,
          revision,
        });
        if (!pendingPushRef.current) setSaveStatus("synced");
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
        setSaveStatus("error");
      };

      for (let attempt = 0; attempt < MAX_SYNC_ATTEMPTS; attempt += 1) {
        if (
          !isCurrentCredential() ||
          !pendingPushRef.current ||
          !isOnlineRef.current
        ) return;

        const snap = ensureStableEntityIds(stateRef.current);
        stateRef.current = snap;
        const attemptedSlices = [...dirtySlicesRef.current];
        const pushVersion = stateVersionRef.current;
        setSaveStatus("saving");
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
        if (attemptedSlices.includes("foodStatuses")) rpcArgs.p_food_statuses = snap.foodStatuses;

        const rpcRes = await client.rpc("sync_trip_slices_v2", rpcArgs);
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
          if (!applyRemoteSnapshot(
            refreshed.data,
            refreshedRevision,
            Number.isFinite(parsedTs) ? parsedTs : 0,
            true,
          )) return;
          continue;
        }
        if (result.ok !== true) {
          markPushFail("伺服器拒絕寫入");
          return;
        }
        markPushOk(result, attemptedSlices, pushVersion, snap);
        return;
      }

      markPushFail(`同步衝突重試 ${MAX_SYNC_ATTEMPTS} 次仍未成功，已保留本機變更`);
    };

    const timer = setTimeout(push, flushRequestedRef.current ? 0 : 2000);
    flushRequestedRef.current = false;
    return () => clearTimeout(timer);
  }, [
    itinerary,
    budgetLimit,
    budgetItems,
    customFoods,
    packingList,
    foodStatuses,
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
    if (!tripCredentialsAreSupported(trimmedId, trimmedSecret)) return false;
    if (
      activeTripIdRef.current
      && activeTripIdRef.current !== trimmedId
      && pendingPushRef.current
      && !(await flushSync())
    ) {
      setSyncError("目前行程仍有未同步變更；請連線完成同步後再切換。");
      return false;
    }
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
      rollbackCandidateRef.current = null;
      setHasRevisionRollback(false);
      supabase.current = client;
      tripSecretRef.current = trimmedSecret;
      clearPendingShareCredential(localStorage);
      unverifiedCredentialRef.current = null;
      mutationBlockedRef.current = false;

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
      baseSnapshotRef.current = cached.baseSnapshot;
      historyRef.current = cached.history;
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
      _setFoodStatuses(cached.snapshot.foodStatuses);
      setPendingSliceCount(cached.dirtySlices.length);
      setSaveStatus(cached.dirtySlices.length > 0 ? "pending" : "synced");
      setVersionHistory(cached.history);
      setLastSyncedAt(cached.remoteUpdatedAt || null);
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
      try {
        upsertTripProfile(localStorage, {
          tripId: trimmedId,
          tripSecret: trimmedSecret,
          label: `東京行程 ${trimmedId.slice(-6)}`,
          lastUsedAt: wallClockNow(),
        });
        setRecentTrips(readTripProfiles(localStorage));
      } catch (err) {
        setStorageError("行程已切換，但無法更新最近行程清單。");
        console.warn("[Sync] profile index write failed:", err);
      }
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

  const localMutationIsAllowed = () => {
    if (!mutationBlockedRef.current) return true;
    setSyncStatus("error");
    setSaveStatus("error");
    setSyncError(
      unverifiedCredentialRef.current
        ? "分享連結尚未驗證，且無法保存安全復原點；驗證完成前不能編輯。"
        : "分享連結憑證已被拒絕；請取得最新分享連結後再編輯。",
    );
    return false;
  };

  const setItinerary = (val: SetStateArg<Itinerary>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.itinerary);
    const normalized = ensureStableEntityIds({ ...stateRef.current, itinerary: next });
    stateRef.current = normalized;
    _setItinerary(normalized.itinerary);
    markLocalMutation("itinerary");
  };
  const setBudgetItems = (val: SetStateArg<BudgetItem[]>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.budgetItems);
    const normalized = ensureStableEntityIds({ ...stateRef.current, budgetItems: next });
    stateRef.current = normalized;
    _setBudgetItems(normalized.budgetItems);
    markLocalMutation("budgetItems");
  };
  const setBudgetLimit = (val: SetStateArg<number>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.budgetLimit);
    stateRef.current = { ...stateRef.current, budgetLimit: next };
    _setBudgetLimit(next);
    markLocalMutation("budgetLimit");
  };
  const setCustomFoods = (val: SetStateArg<CustomFood[]>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.customFoods);
    const normalized = ensureStableEntityIds({ ...stateRef.current, customFoods: next });
    stateRef.current = normalized;
    _setCustomFoods(normalized.customFoods);
    markLocalMutation("customFoods");
  };
  const setPackingList = (val: SetStateArg<PackingItem[]>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.packingList);
    stateRef.current = { ...stateRef.current, packingList: next };
    _setPackingList(next);
    markLocalMutation("packingList");
  };
  const setFoodStatuses = (val: SetStateArg<Record<string, FoodStatus>>) => {
    if (!localMutationIsAllowed()) return;
    const next = resolveNext(val, stateRef.current.foodStatuses);
    stateRef.current = { ...stateRef.current, foodStatuses: next };
    _setFoodStatuses(next);
    markLocalMutation("foodStatuses");
  };

  const retrySync = async () => {
    if (!supabase.current || !tripId || !navigator.onLine) {
      setSyncStatus("offline");
      return false;
    }
    isOnlineRef.current = true;
    setSyncStatus("connecting");
    setSyncError(null);
    const connected = await connectToTrip(
      tripId,
      tripSecretRef.current || tripSecret,
      supabase.current,
    );
    if (connected && pendingPushRef.current) {
      flushRequestedRef.current = true;
      setPushTick((tick) => tick + 1);
    }
    return connected;
  };

  const flushSync = async () => {
    if (!pendingPushRef.current) return true;
    if (!isOnlineRef.current || !navigator.onLine) return false;
    if (syncStatus !== "online") {
      const connected = await retrySync();
      if (!connected) return false;
    }
    flushRequestedRef.current = true;
    setPushTick((tick) => tick + 1);
    const deadline = Date.now() + 12_000;
    while (pendingPushRef.current && Date.now() < deadline) {
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    }
    return !pendingPushRef.current;
  };

  const exportBackup = () => {
    if (typeof window === "undefined") return;
    const payload = JSON.stringify({
      format: "tokyo-trip-backup-v1",
      exportedAt: new Date().toISOString(),
      tripId,
      revision: remoteRevisionRef.current,
      snapshot: stateRef.current,
    }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `tokyo-trip-${tripId || "backup"}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const switchTrip = async (id: string) => {
    const profile = recentTrips.find((item) => item.tripId === id);
    if (!profile) return false;
    if (profile.tripId === tripId) return true;
    if (pendingPushRef.current && !(await flushSync())) return false;
    return loginToTrip(profile.tripId, profile.tripSecret);
  };

  const restoreRevision = (revision: number) => {
    if (!localMutationIsAllowed()) return false;
    const entry = historyRef.current.find((item) => item.revision === revision);
    if (!entry) return false;
    const snapshot = ensureStableEntityIds(structuredClone(entry.snapshot));
    stateRef.current = snapshot;
    _setItinerary(snapshot.itinerary);
    _setBudgetLimit(snapshot.budgetLimit);
    _setBudgetItems(snapshot.budgetItems);
    _setCustomFoods(snapshot.customFoods);
    _setPackingList(snapshot.packingList);
    _setFoodStatuses(snapshot.foodStatuses);
    dirtySlicesRef.current = new Set([
      "itinerary",
      "budgetLimit",
      "budgetItems",
      "customFoods",
      "packingList",
      "foodStatuses",
    ]);
    localUpdatedAtRef.current = Date.now();
    pendingPushRef.current = true;
    stateVersionRef.current += 1;
    setPendingSliceCount(dirtySlicesRef.current.size);
    setSaveStatus("pending");
    persistCurrentCache();
    setPushTick((tick) => tick + 1);
    return true;
  };

  const applyAuthoritativeRollback = () => {
    const candidate = rollbackCandidateRef.current;
    if (!candidate) return false;
    if (candidate.tripId !== activeTripIdRef.current) {
      rollbackCandidateRef.current = null;
      setHasRevisionRollback(false);
      setSyncError("版本確認已失效：目前已切換到另一趟行程，未套用舊行程資料。");
      return false;
    }
    const applied = applyRemoteSnapshot(
      candidate.raw,
      candidate.revision,
      candidate.timestamp,
      false,
    );
    if (!applied) return false;
    rollbackCandidateRef.current = null;
    setHasRevisionRollback(false);
    setIsShareReady(true);
    setSyncStatus("online");
    setSyncError(null);
    promoteVerifiedPendingCredential(
      activeTripIdRef.current,
      tripSecretRef.current,
    );
    return true;
  };

  /**
   * 分享連結使用 hash fragment 承載 secret：
   *   https://host/#trip=...&secret=...
   * hash 不會送到 server，也較不易進 Referer。
   * 開啟後會被 scrubCredentialsFromUrl 清掉。
   */
  const getShareLink = () => {
    if (
      typeof window === "undefined"
      || !isShareReadyRef.current
      || mutationBlockedRef.current
      || unverifiedCredentialRef.current
    ) return "";
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
      if (!writeStorageVerified(STORAGE_KEYS.tripSecret, offlineSecret)) {
        setStorageError("無法保存新的本機密碼，已取消輪換。");
        return { ok: false, error: "瀏覽器儲存空間不可用。" };
      }
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
    const rememberSecret = (secret: string) => {
      try {
        upsertTripProfile(localStorage, {
          tripId,
          tripSecret: secret,
          label: recentTrips.find((item) => item.tripId === tripId)?.label
            || `東京行程 ${tripId.slice(-6)}`,
          lastUsedAt: wallClockNow(),
        });
        setRecentTrips(readTripProfiles(localStorage));
      } catch {
        setStorageError("密碼已更新，但無法更新最近行程清單。");
      }
    };

    const adoptVerifiedCredential = async (
      secret: string,
      verifiedClient: SupabaseClient,
      preloadedData?: SyncRecord,
    ) => {
      supabase.current = verifiedClient;
      tripSecretRef.current = secret;
      const persisted = writeStorageVerified(STORAGE_KEYS.tripSecret, secret);
      setTripSecret(secret);
      setIsShareReady(true);
      const connected = await connectToTrip(
        tripId,
        secret,
        verifiedClient,
        true,
        preloadedData,
      );
      if (persisted && connected) {
        localStorage.removeItem(ROTATION_PENDING_KEY);
      } else if (!persisted) {
        setStorageError("新同步密碼已在雲端生效，但瀏覽器無法持久保存；安全復原點已保留，請先匯出備份。");
      }
      rememberSecret(secret);
      return { persisted, connected };
    };

    const probeRotationOutcome = async (): Promise<"new" | "old" | "unknown"> => {
      const newClient = createTripClient(tripId, newSecret);
      const withNew = await fetchSyncRecord(newClient, tripId)
        .catch(() => ({ data: null, error: { message: "offline" } }));
      if (!withNew.error && withNew.data) {
        await adoptVerifiedCredential(newSecret, newClient, withNew.data);
        return "new";
      }

      const withOld = await fetchSyncRecord(client, tripId)
        .catch(() => ({ data: null, error: { message: "offline" } }));
      if (!withOld.error && withOld.data) {
        tripSecretRef.current = oldSecret;
        const persisted = writeStorageVerified(STORAGE_KEYS.tripSecret, oldSecret);
        setTripSecret(oldSecret);
        const connected = await connectToTrip(tripId, oldSecret, client, true, withOld.data);
        if (persisted && connected) localStorage.removeItem(ROTATION_PENDING_KEY);
        if (!persisted) {
          setStorageError("已確認舊同步密碼仍有效，但瀏覽器無法持久保存；安全復原點已保留。");
        }
        return "old";
      }
      return "unknown";
    };

    try {
      try {
        localStorage.setItem(ROTATION_PENDING_KEY, JSON.stringify({
          tripId,
          oldSecret,
          newSecret,
          createdAt: Date.now(),
        } satisfies PendingRotation));
      } catch {
        setStorageError("瀏覽器無法保存密碼輪換復原資訊；為避免失去行程存取權，已取消操作。");
        return { ok: false, error: "無法建立安全復原點，請先釋放瀏覽器儲存空間。" };
      }
      setSyncStatus("connecting");

      const { data, error } = await client.rpc("rotate_trip_secret", {
        p_trip_id: tripId,
        p_old_secret: oldSecret,
        p_new_secret: newSecret,
      });

      const rpcConfirmed = Boolean(
        data
        && typeof data === "object"
        && (data as { ok?: boolean }).ok === true,
      );

      if (error || !rpcConfirmed) {
        // PostgREST can resolve transport failures as an `error` value instead
        // of throwing. Treat every non-confirmed response as ambiguous and
        // retain the pending marker until an authenticated new/old probe wins.
        const outcome = await probeRotationOutcome();
        if (outcome === "new") return { ok: true, newSecret };
        setSyncStatus(outcome === "old" ? "online" : "error");
        return {
          ok: false,
          error: outcome === "old"
            ? error?.message || "輪換被伺服器拒絕，舊密碼仍有效。"
            : "輪換結果尚待確認；已保留安全復原點，恢復連線或重新開啟後會自動確認新舊密碼。",
        };
      }

      const newClient = createTripClient(tripId, newSecret);
      await adoptVerifiedCredential(newSecret, newClient);
      return { ok: true, newSecret };
    } catch (err) {
      const outcome = await probeRotationOutcome();
      if (outcome === "new") return { ok: true, newSecret };
      if (outcome === "unknown") tripSecretRef.current = oldSecret;
      setSyncStatus(outcome === "old" ? "online" : "error");
      return {
        ok: false,
        error: outcome === "old"
          ? err instanceof Error ? err.message : "輪換失敗，舊密碼仍有效。"
          : "輪換結果尚待確認；已保留安全復原點，恢復連線後會自動復原。",
      };
    }
  };

  return (
    <TripContext.Provider
      value={{
        isLoaded,
        syncStatus,
        saveStatus,
        syncError,
        pendingSliceCount,
        lastSyncedAt,
        storageError,
        isShareReady,
        itinerary,
        budgetItems,
        budgetLimit,
        customFoods,
        packingList,
        foodStatuses,
        tripId,
        tripSecret,
        setItinerary,
        setBudgetItems,
        setBudgetLimit,
        setCustomFoods,
        setPackingList,
        setFoodStatuses,
        loginToTrip,
        rotateTripSecret,
        retrySync,
        flushSync,
        exportBackup,
        recentTrips,
        switchTrip,
        versionHistory,
        restoreRevision,
        hasRevisionRollback,
        applyAuthoritativeRollback,
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
