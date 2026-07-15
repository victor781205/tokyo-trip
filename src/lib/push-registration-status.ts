"use client";

export const PUSH_REGISTRATION_CHANGED_EVENT = "tokyo-trip:push-registration-changed";

export interface PushRegistrationMarker {
  token: string;
  platform: "web" | "ios" | "android";
  verifiedAt: string;
}

function markerKey(tripId: string) {
  return `tokyoPushRegistration:${encodeURIComponent(tripId.trim())}`;
}

export function readPushRegistrationMarker(
  storage: Storage,
  tripId: string | undefined,
): PushRegistrationMarker | null {
  if (!tripId?.trim()) return null;
  try {
    const raw = storage.getItem(markerKey(tripId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PushRegistrationMarker>;
    if (
      typeof parsed.token !== "string"
      || !parsed.token
      || !["web", "ios", "android"].includes(parsed.platform ?? "")
      || typeof parsed.verifiedAt !== "string"
    ) {
      return null;
    }
    return parsed as PushRegistrationMarker;
  } catch {
    return null;
  }
}

export function writePushRegistrationMarker(
  storage: Storage,
  tripId: string,
  marker: Omit<PushRegistrationMarker, "verifiedAt">,
) {
  storage.setItem(markerKey(tripId), JSON.stringify({
    ...marker,
    verifiedAt: new Date().toISOString(),
  } satisfies PushRegistrationMarker));
  window.dispatchEvent(new Event(PUSH_REGISTRATION_CHANGED_EVENT));
}

export function clearPushRegistrationMarker(storage: Storage, tripId: string | undefined) {
  if (!tripId?.trim()) return;
  storage.removeItem(markerKey(tripId));
  window.dispatchEvent(new Event(PUSH_REGISTRATION_CHANGED_EVENT));
}
