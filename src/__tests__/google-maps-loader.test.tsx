import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRoutePlanningStatusMessage, RouteMapView } from "@/components/RouteMapView";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type TestWindow = Window & {
  google?: typeof google;
  gm_authFailure?: () => void;
  __tokyoTripGoogleMapsAuthBridge?: boolean;
};

describe("Google Maps loader", () => {
  const originalKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    document.getElementById("google-maps-script")?.remove();
    delete (window as TestWindow).google;
    delete (window as TestWindow).gm_authFailure;
    delete (window as TestWindow).__tokyoTripGoogleMapsAuthBridge;
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

  it("keeps the loading state until Directions responds, then announces ZERO_RESULTS while retaining the map", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    let directionsCallback: ((result: unknown, status: string) => void) | undefined;

    class MockMap {
      fitBounds = vi.fn();
    }
    class MockTransitLayer {
      setMap = vi.fn();
    }
    class MockDirectionsRenderer {
      setMap = vi.fn();
      setDirections = vi.fn();
    }
    class MockDirectionsService {
      route(_request: unknown, callback: (result: unknown, status: string) => void) {
        directionsCallback = callback;
      }
    }
    class MockGeocoder {
      geocode = vi.fn();
    }
    class MockLatLngBounds {
      extend = vi.fn();
    }
    class MockMarker {}

    (window as TestWindow).google = {
      maps: {
        Map: MockMap,
        TransitLayer: MockTransitLayer,
        DirectionsRenderer: MockDirectionsRenderer,
        DirectionsService: MockDirectionsService,
        Geocoder: MockGeocoder,
        LatLngBounds: MockLatLngBounds,
        Marker: MockMarker,
        ControlPosition: { RIGHT_BOTTOM: 9 },
        TravelMode: { TRANSIT: "TRANSIT" },
      },
    } as unknown as typeof google;

    render(<RouteMapView originName="錦糸町" destName="不存在的目的地" />);

    expect(screen.getByRole("status")).toHaveTextContent("載入地圖與大眾運輸路線中");
    await waitFor(() => expect(directionsCallback).toBeTypeOf("function"));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => directionsCallback?.(null, "ZERO_RESULTS"));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到可用的大眾運輸路線");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText("地圖載入失敗")).not.toBeInTheDocument();
  });

  it("provides readable route-planning messages without exposing raw status codes", () => {
    expect(getRoutePlanningStatusMessage("ZERO_RESULTS")).toContain("找不到可用的大眾運輸路線");
    expect(getRoutePlanningStatusMessage("REQUEST_DENIED")).toContain("暫時無法提供路線規劃");
    expect(getRoutePlanningStatusMessage("SOMETHING_NEW")).not.toContain("SOMETHING_NEW");
  });
});
