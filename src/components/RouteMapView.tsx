"use client";

import { useEffect, useRef, useState } from "react";
import {
  GoogleMapsLoadError,
  loadGoogleMaps,
  subscribeToGoogleMapsAuthFailure,
} from "@/lib/google-maps-loader";

export function RouteMapView({ originName, destName }: { originName: string; destName: string }) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">(apiKey ? "loading" : "error");
  const [errorMessage, setErrorMessage] = useState(
    apiKey ? "Google Maps 暫時無法載入。" : "Google Maps 金鑰尚未設定，請改用外部導航。",
  );
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    if (!mapRef.current) return;
    if (!apiKey) return;

    // 標記這次 effect 是否已被取消（unmount / deps 變更）
    // loadGoogleMaps 內部 polling 等 window.google.maps 最多 10 秒，
    // 若元件在 polling 期間 unmount，polling 的 resolve 觸發後仍會接著
    // setStatus("ok") / 建 Map，這裡用 cancelled 做 gate 防止後續動作。
    let cancelled = false;
    const unsubscribeAuthFailure = subscribeToGoogleMapsAuthFailure(() => {
      if (cancelled) return;
      setErrorMessage("Google Maps 驗證失敗，請改用外部導航。");
      setStatus("error");
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
            } else {
              // 路線規劃失敗（例如輸入已存在但 transit destinations 過遠、或跨國），
              // 退回 geocode 兩個地點並放 marker + fitBounds，至少看得到「起」「終」位置
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
                    done += 1;
                    if (st === "OK" && res && res[0]) {
                      okCount += 1;
                      const pos = res[0].geometry.location;
                      new google.maps.Marker({ position: pos, map, label });
                      bounds.extend(pos);
                      if (done === q.length && okCount > 0) map.fitBounds(bounds);
                    }
                  }
                );
              });
            }
          }
        );

        setStatus("ok");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setErrorMessage(
          error instanceof GoogleMapsLoadError
            ? error.message
            : "Google Maps 暫時無法載入，請重試或改用外部導航。",
        );
        setStatus("error");
      });

    return () => {
      cancelled = true;
      unsubscribeAuthFailure();
    };
  }, [apiKey, originName, destName, retryKey]);

  if (status === "error") {
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
              setStatus("loading");
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
    <div ref={mapRef} className="w-full h-full" style={{ minHeight: "450px" }} />
  );
}
