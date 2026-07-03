"use client";

import { useEffect, useRef, useState } from "react";

// 動態載入 Google Maps JS API
function loadGoogleMaps(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined") return reject("no window");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any;
    if (w.google?.maps) return resolve();

    if (w._googleMapsLoading) {
      w._googleMapsCallbacks.push(resolve);
      return;
    }
    w._googleMapsCallbacks = [resolve];
    w._googleMapsLoading = true;

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=zh-TW&region=JP`;
    script.async = true;
    script.defer = true;

    // script.onload 時 google.maps 不一定 ready（async/defer 載入有 race condition）
    // 用 polling 等 window.google.maps 出現才 resolve，避免 setStatus("error") 誤判
    const fire = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as any;
      if (w.google?.maps) {
        /* eslint-disable @typescript-eslint/no-explicit-any */
        (window as any)._googleMapsCallbacks.forEach((cb: () => void) => cb());
        (window as any)._googleMapsCallbacks = [];
        (window as any)._googleMapsLoading = false;
        /* eslint-enable @typescript-eslint/no-explicit-any */
        return true;
      }
      return false;
    };

    script.onload = () => {
      if (fire()) return;
      // onload 但 google.maps 還沒初始化，polling 等
      let tries = 0;
      const timer = setInterval(() => {
        if (fire() || ++tries > 100) clearInterval(timer);  // 最多等 10 秒
      }, 100);
    };
    script.onerror = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._googleMapsLoading = false;
      reject("Google Maps script failed");
    };
    document.head.appendChild(script);
  });
}

export function RouteMapView({ originName, destName }: { originName: string; destName: string }) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey || !mapRef.current) {
      setStatus("error");
      return;
    }

    let cancelled = false;

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
      .catch(() => {
        if (!cancelled) setStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, [originName, destName]);

  if (status === "error") {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-100" style={{ minHeight: "450px" }}>
        <div className="text-gray-500 font-bold mb-2">地圖載入失敗</div>
        <a
          href={`https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originName)}&destination=${encodeURIComponent(destName)}&travelmode=transit`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary text-sm underline font-bold"
        >
          開啟 Google Maps →
        </a>
      </div>
    );
  }

  return (
    <div ref={mapRef} className="w-full h-full" style={{ minHeight: "450px" }} />
  );
}
