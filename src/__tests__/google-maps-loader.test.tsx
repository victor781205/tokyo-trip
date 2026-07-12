import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RouteMapView } from "@/components/RouteMapView";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type TestWindow = Window & {
  google?: typeof google;
  gm_authFailure?: () => void;
};

describe("Google Maps loader", () => {
  const originalKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    document.getElementById("google-maps-script")?.remove();
    delete (window as TestWindow).google;
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    document.getElementById("google-maps-script")?.remove();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalKey;
  });

  it("settles as a timeout instead of leaving the caller loading forever", async () => {
    vi.useFakeTimers();
    const result = loadGoogleMaps("test-key", 250);
    const assertion = expect(result).rejects.toMatchObject({ code: "timeout" });

    await vi.advanceTimersByTimeAsync(251);
    await assertion;
  });

  it("rejects the pending load when Google reports an authentication failure", async () => {
    const result = loadGoogleMaps("invalid-key", 5_000);
    const assertion = expect(result).rejects.toMatchObject({ code: "auth" });

    (window as TestWindow).gm_authFailure?.();
    await assertion;
  });

  it("shows actionable fallback controls when the key is missing", async () => {
    render(<RouteMapView originName="錦糸町" destName="澀谷" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("金鑰尚未設定");
    fireEvent.click(screen.getByRole("button", { name: "重新載入" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("金鑰尚未設定");
    expect(screen.getByRole("link", { name: /開啟 Google Maps/ })).toHaveAttribute("target", "_blank");
  });
});
