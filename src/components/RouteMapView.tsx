"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleMapsLoadError,
  loadGoogleMaps,
  subscribeToGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";

export function getRoutePlanningStatusMessage(status: string) {
  switch (status) {
    case "ZERO_RESULTS":
      return "找不到可用的大眾運輸路線，已改為顯示起點與目的地位置。";
    case "NOT_FOUND":
      return "無法辨識起點或目的地，已嘗試在地圖上標示可辨識的位置。";
    case "OVER_QUERY_LIMIT":
      return "目前路線查詢量較大，已改為顯示起點與目的地位置，請稍後再試。";
    case "REQUEST_DENIED":
      return "Google Maps 暫時無法提供路線規劃，已改為顯示起點與目的地位置。";
    case "INVALID_REQUEST":
      return "路線查詢資料不完整，請確認起點與目的地後重新查詢。";
    case "UNKNOWN_ERROR":
      return "Google Maps 暫時無法完成路線規劃，已改為顯示起點與目的地位置。";
    default:
      return "目前無法完成大眾運輸路線規劃，已改為顯示起點與目的地位置。";
  }
}

export function RouteMapView({ originName, destName }: { originName: string; destName: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef<HTMLDivElement>(null);
  const [retryKey, setRetryKey] = useState(0);
  const queryKey = `${apiKey ?? ""}\n${originName}\n${destName}\n${retryKey}`;
  const [status, setStatus] = useState<"loading" | "ok" | "error">(apiKey ? "loading" : "error");
  const [settledQueryKey, setSettledQueryKey] = useState<string | null>(apiKey ? null : queryKey);
  const [errorMessage, setErrorMessage] = useState(
    apiKey ? "Google Maps 暫時無法載入。" : "Google Maps 金鑰尚未設定，請改用外部導航。",
  );
  const [routeWarning, setRouteWarning] = useState<{ queryKey: string; message: string } | null>(null);
  const currentStatus = settledQueryKey === queryKey ? status : apiKey ? "loading" : "error";
  const currentRouteWarning = routeWarning?.queryKey === queryKey ? routeWarning.message : null;

  useEffect(() => {
    if (!mapRef.current) return;
    if (!apiKey) return;

    // 標記這次 effect 是否已被取消（unmount / deps 變更）
    // loadGoogleMaps 內部 polling 等 window.google.maps 最多 10 秒，
    // 若元件在 polling 期間 unmount，polling 的 resolve 觸發後仍會接著
    // 路線查詢完成 / 建 Map 前，這裡用 cancelled 做 gate 防止後續動作。
    let cancelled = false;
    const unsubscribeAuthFailure = subscribeToGoogleMapsAuthFailure(() => {
      if (cancelled) return;
      setErrorMessage("Google Maps 驗證失敗，請改用外部導航。");
      setStatus("error");
      setSettledQueryKey(queryKey);
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

        // 顯示地鐵/大眾運輸路網（彩色線條）
        const transitLayer = new google.maps.TransitLayer();
        transitLayer.setMap(map);

        const directionsService = new google.maps.DirectionsService();
        const directionsRenderer = new google.maps.DirectionsRenderer({
          suppressMarkers: false,
          polylineOptions: { strokeColor: "#e74c3c", strokeWeight: 5 },
        });
        directionsRenderer.setMap(map);

        // 直接傳「字串地名 + 區域 context」給 Google，提高命中率避免 ZERO_RESULTS
        // 純「迪士尼」「機場」這類短字可能 Google 找不到，加上「日本」區域提示
        const normalize = (s: string) => {
          const trimmed = s.trim();
          // 已含明確地點（如「東京迪士尼」「東京車站」）就不再加後綴
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
          (result: any, status: string) => {
            if (cancelled) return;
            if (status === "OK" && result) {
              directionsRenderer.setDirections(result);
              // 路線畫好後，自動縮放到包含整條路線的範圍
              if (result.routes && result.routes[0]?.bounds) {
                map.fitBounds(result.routes[0].bounds);
              }
              setStatus("ok");
              setSettledQueryKey(queryKey);
            } else {
              // 路線規劃失敗（例如輸入已存在但 transit destinations 過遠、或跨國），
              // 退回 geocode 兩個地點並放 marker + fitBounds，至少看得到「起」「終」位置
              setRouteWarning({ queryKey, message: getRoutePlanningStatusMessage(status) });
              setStatus("ok");
              setSettledQueryKey(queryKey);
              const geocoder = new google.maps.Geocoder();
              const q: Array<[string, "起" | "終"]> = [[originName, "起"], [destName, "終"]];
              const bounds = new google.maps.LatLngBounds();
              let done = 0;
              let okCount = 0;
              q.forEach(([addr, label]) => {
                geocoder.geocode(
                  { address: normalize(addr), region: "JP" },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  (res: any, st: string) => {
                    if (cancelled) return;
                    done += 1;
                    if (st === "OK" && res && res[0]) {
                      okCount += 1;
                      const pos = res[0].geometry.location;
                      new google.maps.Marker({ position: pos, map, label });
                      bounds.extend(pos);
                    }

                    if (done === q.length && okCount > 0) map.fitBounds(bounds);
                  }
                );
              });
            }
          }
        );

      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof GoogleMapsLoadError
            ? error.message
            : "Google Maps 暫時無法載入，請重試或改用外部導航。",
        );
        setStatus("error");
        setSettledQueryKey(queryKey);
      });

    return () => {
      cancelled = true;
      unsubscribeAuthFailure();
    };
  }, [apiKey, originName, destName, queryKey, retryKey]);

  if (currentStatus === "error") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100" style={{ minHeight: "450px" }}>
        <div className="text-gray-500 font-bold mb-2">地圖載入失敗</div>
        <p className="max-w-sm px-6 text-center text-sm text-gray-500 mb-4" role="alert">
          {errorMessage}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (!apiKey) {
                setErrorMessage("Google Maps 金鑰尚未設定，請改用外部導航。");
                setStatus("error");
                return;
              }
              setRetryKey((value) => value + 1);
            }}
            className="min-h-11 px-4 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-black"
          >
            重新載入
          </button>
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName)}&destination=${encodeURIComponent(destName)}&travelmode=transit`}
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-11 px-4 rounded-xl bg-primary text-white text-sm font-black inline-flex items-center"
          >
            開啟 Google Maps →
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: "450px" }}>
      <div ref={mapRef} className="w-full h-full" style={{ minHeight: "450px" }} />

      {currentStatus === "loading" && (
        <div
          role="status"
          aria-live="polite"
          className="absolute inset-0 flex items-center justify-center bg-gray-100/90 px-6 text-center text-sm font-bold text-gray-500"
        >
          載入地圖與大眾運輸路線中...
        </div>
      )}

      {currentRouteWarning && (
        <div
          role="alert"
          className="absolute inset-x-4 top-4 rounded-2xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-sm font-bold leading-relaxed text-amber-800 shadow-lg backdrop-blur-sm dark:border-amber-800 dark:bg-amber-950/90 dark:text-amber-200"
        >
          {currentRouteWarning}
        </div>
      )}
    </div>
  );
}
