import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRoutePlanningStatusMessage, RouteMapView } from "@/components/RouteMapView";
import { loadGoogleMaps } from "@/lib/google-maps-loader";

type TestWindow = Window & {
  google?: typeof google;
  gm_authFailure?: () => void;
  __tokyoTripGoogleMapsAuthBridge?: boolean;
};

type DirectionsCallback = (result: unknown, status: string) => void;
type GeocodeCallback = (result: unknown, status: string) => void;

function installMockMapRuntime() {
  let directionsCallback: DirectionsCallback | undefined;
  const geocodeCalls: Array<{ request: { address: string }; callback: GeocodeCallback }> = [];
  const markerOptions: Array<{ label: string; position: unknown }> = [];
  const mapInstances: Array<{
    fitBounds: ReturnType<typeof vi.fn>;
    setCenter: ReturnType<typeof vi.fn>;
    setZoom: ReturnType<typeof vi.fn>;
  }> = [];

  class MockMap {
    fitBounds = vi.fn();
    setCenter = vi.fn();
    setZoom = vi.fn();

    constructor() {
      mapInstances.push(this);
    }
  }
  class MockTransitLayer {
    setMap = vi.fn();
  }
  class MockDirectionsRenderer {
    setMap = vi.fn();
    setDirections = vi.fn();
  }
  class MockDirectionsService {
    route(_request: unknown, callback: DirectionsCallback) {
      directionsCallback = callback;
    }
  }
  class MockGeocoder {
    geocode(request: { address: string }, callback: GeocodeCallback) {
      geocodeCalls.push({ request, callback });
    }
  }
  class MockLatLngBounds {
    extend = vi.fn();
  }
  class MockMarker {
    constructor(options: { label: string; position: unknown }) {
      markerOptions.push(options);
    }
  }

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

  return {
    geocodeCalls,
    markerOptions,
    mapInstances,
    getDirectionsCallback: () => directionsCallback,
  };
}

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
    expect(screen.queryByRole("button", { name: "重新載入" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /開啟 Google Maps/ })).toHaveAttribute("target", "_blank");
  });

  it("waits for both fallback geocodes before showing two markers as a non-route", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const runtime = installMockMapRuntime();

    render(<RouteMapView originName="錦糸町" destName="不存在的目的地" />);

    expect(screen.getByRole("status")).toHaveTextContent("載入地圖與大眾運輸路線中");
    await waitFor(() => expect(runtime.getDirectionsCallback()).toBeTypeOf("function"));
    expect(screen.getByRole("status")).toBeInTheDocument();

    act(() => runtime.getDirectionsCallback()?.(null, "ZERO_RESULTS"));

    expect(screen.getByRole("status")).toHaveTextContent("正在確認起點與目的地位置");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(runtime.geocodeCalls).toHaveLength(2);

    act(() => runtime.geocodeCalls[0].callback([
      { geometry: { location: { lat: 35.6967, lng: 139.8144 } } },
    ], "OK"));

    expect(screen.getByRole("status")).toHaveTextContent("正在確認起點與目的地位置");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    act(() => runtime.geocodeCalls[1].callback([
      { geometry: { location: { lat: 35.658, lng: 139.7016 } } },
    ], "OK"));

    expect(await screen.findByRole("alert")).toHaveTextContent("找不到可用的大眾運輸路線");
    expect(screen.getByRole("alert")).toHaveTextContent("未繪製大眾運輸路線");
    expect(screen.getByText(/地點標記 · 非完整路線/)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(runtime.markerOptions.map((marker) => marker.label)).toEqual(["起", "終"]);
    expect(runtime.mapInstances[0].fitBounds).toHaveBeenCalledOnce();
  });

  it("shows a real error instead of a blank map when neither garbled endpoint resolves", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const runtime = installMockMapRuntime();

    render(<RouteMapView originName="���@@@" destName="###���" />);
    await waitFor(() => expect(runtime.getDirectionsCallback()).toBeTypeOf("function"));

    act(() => runtime.getDirectionsCallback()?.(null, "NOT_FOUND"));
    expect(screen.getByRole("status")).toHaveTextContent("正在確認起點與目的地位置");

    act(() => {
      runtime.geocodeCalls[0].callback([], "ZERO_RESULTS");
      runtime.geocodeCalls[1].callback([], "ZERO_RESULTS");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("起點「���@@@」與目的地「###���」都無法辨識");
    expect(screen.getByText("找不到起點與目的地")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(runtime.markerOptions).toHaveLength(0);
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /開啟 Google Maps/ })).toBeInTheDocument();
  });

  it("keeps the single valid endpoint visible and identifies the failed destination", async () => {
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = "test-key";
    const runtime = installMockMapRuntime();

    render(<RouteMapView originName="錦糸町" destName="���目的地" />);
    await waitFor(() => expect(runtime.getDirectionsCallback()).toBeTypeOf("function"));

    act(() => runtime.getDirectionsCallback()?.(null, "ZERO_RESULTS"));
    act(() => {
      runtime.geocodeCalls[0].callback([
        { geometry: { location: { lat: 35.6967, lng: 139.8144 } } },
      ], "OK");
      runtime.geocodeCalls[1].callback([], "ZERO_RESULTS");
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("目的地「���目的地」無法辨識");
    expect(screen.getByRole("alert")).toHaveTextContent("目前只標示起點「錦糸町」");
    expect(screen.getByRole("alert")).toHaveTextContent("不是完整路線");
    expect(runtime.markerOptions.map((marker) => marker.label)).toEqual(["起"]);
    expect(runtime.mapInstances[0].setCenter).toHaveBeenCalledOnce();
    expect(runtime.mapInstances[0].setZoom).toHaveBeenCalledWith(15);
  });

  it("provides readable route-planning messages without exposing raw status codes", () => {
    expect(getRoutePlanningStatusMessage("ZERO_RESULTS")).toContain("找不到可用的大眾運輸路線");
    expect(getRoutePlanningStatusMessage("REQUEST_DENIED")).toContain("暫時無法提供路線規劃");
    expect(getRoutePlanningStatusMessage("SOMETHING_NEW")).not.toContain("SOMETHING_NEW");
  });
});
