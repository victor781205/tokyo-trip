import { describe, expect, it, vi } from "vitest";
import {
  PUSH_REGISTRATION_CHANGED_EVENT,
  clearPushRegistrationMarker,
  readPushRegistrationMarker,
  writePushRegistrationMarker,
} from "@/lib/push-registration-status";

describe("push registration marker", () => {
  it("records a trip-scoped backend acknowledgement and clears it", () => {
    localStorage.clear();
    const changed = vi.fn();
    window.addEventListener(PUSH_REGISTRATION_CHANGED_EVENT, changed);

    writePushRegistrationMarker(localStorage, "trip-a", {
      token: "endpoint-a",
      platform: "web",
    });

    expect(readPushRegistrationMarker(localStorage, "trip-a")).toMatchObject({
      token: "endpoint-a",
      platform: "web",
    });
    expect(readPushRegistrationMarker(localStorage, "trip-b")).toBeNull();

    clearPushRegistrationMarker(localStorage, "trip-a");
    expect(readPushRegistrationMarker(localStorage, "trip-a")).toBeNull();
    expect(changed).toHaveBeenCalledTimes(2);
    window.removeEventListener(PUSH_REGISTRATION_CHANGED_EVENT, changed);
  });
});
