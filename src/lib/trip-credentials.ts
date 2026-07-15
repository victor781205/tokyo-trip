export const PENDING_SHARE_CREDENTIAL_KEY = "tokyoTripPendingShareCredential:v1";

export type TripCredentials = {
  tripId: string;
  tripSecret: string;
};

export type PendingShareCredential = TripCredentials & {
  version: 1;
  status: "unverified";
  source: "share-hash";
  createdAt: number;
};

type CredentialStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Keep the client-side credential envelope aligned with the server headers. */
export function tripCredentialsAreSupported(tripId: string, tripSecret: string) {
  if (
    !tripId
    || !tripSecret
    || /[\u0000-\u001f\u007f]/.test(tripId + tripSecret)
  ) return false;
  const encoder = new TextEncoder();
  return encoder.encode(tripId).byteLength <= 64
    && encoder.encode(tripSecret).byteLength <= 128;
}

/**
 * A scrubbed share hash needs a recovery handle while its credentials are
 * awaiting remote verification. This record is deliberately separate from
 * the trusted active credential and recent-trip profile stores.
 */
export function rememberPendingShareCredential(
  storage: CredentialStorage,
  credentials: TripCredentials,
  createdAt = Date.now(),
) {
  const tripId = credentials.tripId.trim();
  const tripSecret = credentials.tripSecret.trim();
  if (!tripCredentialsAreSupported(tripId, tripSecret)) return false;
  const value: PendingShareCredential = {
    version: 1,
    status: "unverified",
    source: "share-hash",
    tripId,
    tripSecret,
    createdAt,
  };
  try {
    const serialized = JSON.stringify(value);
    storage.setItem(PENDING_SHARE_CREDENTIAL_KEY, serialized);
    return storage.getItem(PENDING_SHARE_CREDENTIAL_KEY) === serialized;
  } catch {
    return false;
  }
}

export function readPendingShareCredential(
  storage: Pick<Storage, "getItem">,
): PendingShareCredential | null {
  try {
    const raw = storage.getItem(PENDING_SHARE_CREDENTIAL_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PendingShareCredential>;
    if (
      value.version !== 1
      || value.status !== "unverified"
      || value.source !== "share-hash"
      || typeof value.tripId !== "string"
      || typeof value.tripSecret !== "string"
      || typeof value.createdAt !== "number"
      || !Number.isFinite(value.createdAt)
      || value.createdAt <= 0
    ) return null;
    const tripId = value.tripId.trim();
    const tripSecret = value.tripSecret.trim();
    if (!tripCredentialsAreSupported(tripId, tripSecret)) return null;
    return { ...value, tripId, tripSecret } as PendingShareCredential;
  } catch {
    return null;
  }
}

/** Avoid an older async attempt clearing a newer pending share link. */
export function clearPendingShareCredential(
  storage: CredentialStorage,
  expected?: TripCredentials,
) {
  try {
    if (expected) {
      const current = readPendingShareCredential(storage);
      if (
        !current
        || current.tripId !== expected.tripId.trim()
        || current.tripSecret !== expected.tripSecret.trim()
      ) return false;
    }
    storage.removeItem(PENDING_SHARE_CREDENTIAL_KEY);
    return storage.getItem(PENDING_SHARE_CREDENTIAL_KEY) === null;
  } catch {
    return false;
  }
}
