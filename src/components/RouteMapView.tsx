"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleMapsLoadError,
  loadGoogleMaps,
  subscribeToGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";

type RouteMapViewState =
  | { queryKey: string; status: "loading"; message: string }
  | { queryKey: string; status: "ok"; warning: string | null }
  | { queryKey: string; status: "error"; title: string; message: string };

type RouteEndpoint = {
  kind: "origin" | "destination";
  label: "起點" | "目的地";
  markerLabel: "起" | "終";
  name: string;
};

const INITIAL_LOADING_MESSAGE = "載入地圖與大眾運輸路線中...";
const GEOCODING_LOADING_MESSAGE = "路線無法直接繪製，正在確認起點與目的地位置...";
const MISSING_KEY_MESSAGE = "Google Maps 金鑰尚未設定，請改用外部導航。";
const GEOCODING_TIMEOUT_MS = 8_000;

export function getRoutePlanningStatusMessage(status: string) {
  switch (status) {
    case "ZERO_RESULTS":
      return "找不到可用的大眾運輸路線。";
    case "NOT_FOUND":
      return "Google Maps 無法直接辨識這組路線。";
    case "OVER_QUERY_LIMIT":
      return "目前路線查詢量較大，請稍後再試。";
    case "REQUEST_DENIED":
      return "Google Maps 暫時無法提供路線規劃。";
    case "INVALID_REQUEST":
      return "路線查詢資料不完整，請確認起點與目的地後重新查詢。";
    case "UNKNOWN_ERROR":
      return "Google Maps 暫時無法完成路線規劃。";
    default:
      return "目前無法完成大眾運輸路線規劃。";
  }
}

function getNoLocationsMessage(originName: string, destName: string) {
  return `起點「${originName}」與目的地「${destName}」都無法辨識。請修正地名後重新查詢，或改用外部 Google Maps。`;
}

export function RouteMapView({ originName, destName }: { originName: string; destName: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef<HTMLDivElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  const queryKey = `${apiKey ?? ""}\n${originName}\n${destName}\n${retryKey}`;
  const [viewState, setViewState] = useState<RouteMapViewState>(() => apiKey
    ? { queryKey, status: "loading", message: INITIAL_LOADING_MESSAGE }
    : { queryKey, status: "error", title: "地圖無法載入", message: MISSING_KEY_MESSAGE });

  const currentState: RouteMapViewState = viewState.queryKey === queryKey
    ? viewState
    : apiKey
      ? { queryKey, status: "loading", message: INITIAL_LOADING_MESSAGE }
      : { queryKey, status: "error", title: "地圖無法載入", message: MISSING_KEY_MESSAGE };

  useEffect(() => {
    if (!mapRef.current || !apiKey) return;

    let cancelled = false;
    let geocodingTimeoutId: number | undefined;
    setViewState({ queryKey, status: "loading", message: INITIAL_LOADING_MESSAGE });

    const unsubscribeAuthFailure = subscribeToGoogleMapsAuthFailure(() => {
      if (cancelled) return;
      setViewState({
        queryKey,
        status: "error",
        title: "Google Maps 驗證失敗",
        message: "Google Maps 驗證失敗，請改用外部導航。",
      });
    });

    loadGoogleMaps(apiKey)
      .then(() => {
        if (cancelled || !mapRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const google = (window as any).google;

        const map = new google.maps.Map(mapRef.current, {
          zoom: 13,
          center: { lat: 35.6812, lng: 139.7671 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          styles: [
            { featureType: "road", stylers: [{ visibility: "simplified" }, { lightness: 40 }] },
            { featureType: "road.highway", stylers: [{ visibility: "off" }] },
            { featureType: "landscape", stylers: [{ lightness: 30 }] },
            { featureType: "poi", stylers: [{ visibility: "off" }] },
            { featureType: "administrative", stylers: [{ visibility: "on" }, { lightness: 20 }] },
          ],
        });

        const transitLayer = new google.maps.TransitLayer();
        transitLayer.setMap(map);

        const directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: false,
          polylineOptions: { strokeColor: "#c02f26", strokeWeight: 5 },
        });
        directionsRenderer.setMap(map);

        const normalize = (value: string) => {
          const trimmed = value.trim();
          if (/東京|日本|機場|駅|站|JP$/i.test(trimmed)) return trimmed;
          return `${trimmed}, 日本`;
        };

        directionsService.route(
          {
            origin: normalize(originName),
            destination: normalize(destName),
            travelMode: google.maps.TravelMode.TRANSIT,
            transitOptions: {},
            region: "JP",
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result: any, directionsStatus: string) => {
            if (cancelled) return;
            if (directionsStatus === "OK" && result) {
              directionsRenderer.setDirections(result);
              if (result.routes?.[0]?.bounds) map.fitBounds(result.routes[0].bounds);
              setViewState({ queryKey, status: "ok", warning: null });
              return;
            }

            // Directions 失敗後不能先宣告成功；等兩端 geocode 都結束，
            // 才知道能顯示完整 fallback、單一 marker，或完全無法顯示。
            setViewState({ queryKey, status: "loading", message: GEOCODING_LOADING_MESSAGE });
            const endpoints: RouteEndpoint[] = [
              { kind: "origin", label: "起點", markerLabel: "起", name: originName },
              { kind: "destination", label: "目的地", markerLabel: "終", name: destName },
            ];
            const geocoder = new google.maps.Geocoder();
            const results = new Map<RouteEndpoint["kind"], { endpoint: RouteEndpoint; location: unknown | null }>();

            const finishGeocoding = () => {
              if (cancelled || results.size !== endpoints.length) return;
              if (geocodingTimeoutId !== undefined) window.clearTimeout(geocodingTimeoutId);
              const resolved = endpoints
                .map((endpoint) => results.get(endpoint.kind))
                .filter((entry): entry is { endpoint: RouteEndpoint; location: unknown } => Boolean(entry?.location));

              if (resolved.length === 0) {
                setViewState({
                  queryKey,
                  status: "error",
                  title: "找不到起點與目的地",
                  message: getNoLocationsMessage(originName, destName),
                });
                return;
              }

              const bounds = new google.maps.LatLngBounds();
              resolved.forEach(({ endpoint, location }) => {
                new google.maps.Marker({ position: location, map, label: endpoint.markerLabel });
                bounds.extend(location);
              });

              if (resolved.length === 1) {
                const validEndpoint = resolved[0];
                const failedEndpoint = endpoints.find((endpoint) => endpoint.kind !== validEndpoint.endpoint.kind)!;
                map.setCenter?.(validEndpoint.location);
                map.setZoom?.(15);
                setViewState({
                  queryKey,
                  status: "ok",
                  warning: `${failedEndpoint.label}「${failedEndpoint.name}」無法辨識。目前只標示${validEndpoint.endpoint.label}「${validEndpoint.endpoint.name}」；此畫面不是完整路線，請修正${failedEndpoint.label}後重試。`,
                });
                return;
              }

              map.fitBounds(bounds);
              setViewState({
                queryKey,
                status: "ok",
                warning: `${getRoutePlanningStatusMessage(directionsStatus)}目前僅顯示起點與目的地標記，未繪製大眾運輸路線。`,
              });
            };

            const settleEndpoint = (endpoint: RouteEndpoint, location: unknown | null) => {
              if (cancelled || results.has(endpoint.kind)) return;
              results.set(endpoint.kind, { endpoint, location });
              finishGeocoding();
            };

            // Google 通常會回呼，但仍加上上限，避免網路異常時永遠停在 loading。
            geocodingTimeoutId = window.setTimeout(() => {
              endpoints.forEach((endpoint) => settleEndpoint(endpoint, null));
            }, GEOCODING_TIMEOUT_MS);

            endpoints.forEach((endpoint) => {
              try {
                geocoder.geocode(
                  { address: normalize(endpoint.name), region: "JP" },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (geocodeResults: any, geocodeStatus: string) => {
                    const location = geocodeStatus === "OK"
                      ? geocodeResults?.[0]?.geometry?.location ?? null
                      : null;
                    settleEndpoint(endpoint, location);
                  },
                );
              } catch {
                settleEndpoint(endpoint, null);
              }
            });
          },
        );
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setViewState({
          queryKey,
          status: "error",
          title: "地圖載入失敗",
          message: error instanceof GoogleMapsLoadError
            ? error.message
            : "Google Maps 暫時無法載入，請重試或改用外部導航。",
        });
      });

    return () => {
      cancelled = true;
      if (geocodingTimeoutId !== undefined) window.clearTimeout(geocodingTimeoutId);
      unsubscribeAuthFailure();
    };
  }, [apiKey, originName, destName, queryKey]);

  const externalMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName)}&destination=${encodeURIComponent(destName)}&travelmode=transit`;

  if (currentState.status === "error") {
    return (
      <div className="flex h-full min-h-[360px] w-full flex-col items-center justify-center bg-gray-100 px-5 py-8 text-center dark:bg-slate-900 md:min-h-[450px]">
        <div className="mb-2 text-lg font-black text-gray-700 dark:text-gray-200">{currentState.title}</div>
        <p className="mb-5 max-w-md text-sm font-medium leading-relaxed text-gray-600 dark:text-gray-300" role="alert">
          {currentState.message}
        </p>
        <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-center">
          {apiKey && (
            <button
              type="button"
              onClick={() => setRetryKey((value) => value + 1)}
              className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-black text-gray-700 shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-gray-100 sm:w-auto"
            >
              重新載入
            </button>
          )}
          <a
            href={externalMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-black text-white shadow-sm sm:w-auto"
          >
            開啟 Google Maps →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[360px] w-full bg-slate-100 dark:bg-slate-900 md:min-h-[450px]">
      <div ref={mapRef} className="h-full min-h-[360px] w-full md:min-h-[450px]" aria-label="路線地圖" />

      {currentState.status === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-100/95 px-6 text-center text-sm font-bold leading-relaxed text-gray-600 backdrop-blur-sm dark:bg-slate-900/95 dark:text-gray-300"
        >
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-primary/25 border-t-primary" aria-hidden="true" />
          {currentState.message}
        </div>
      )}

      {currentState.status === "ok" && currentState.warning && (
        <div
          role="alert"
          className="absolute inset-x-3 top-3 max-h-[45%] overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-bold leading-relaxed text-amber-900 shadow-lg backdrop-blur-sm dark:border-amber-800 dark:bg-amber-950/95 dark:text-amber-100 sm:inset-x-4 sm:top-4"
        >
          <span className="mb-1 block text-xs font-black uppercase tracking-[0.14em] text-amber-700 dark:text-amber-300">
            地點標記 · 非完整路線
          </span>
          {currentState.warning}
        </div>
      )}
    </div>
  );
}
