"use client";

import { useEffect, useRef, useState } from "react";

type LatLng = { lat: number; lng: number };

const KNOWN_PLACES: Record<string, LatLng> = {
  "東京東武黎凡特飯店": { lat: 35.6966, lng: 139.8144 },
  "澀谷": { lat: 35.6580, lng: 139.7016 },
  "新宿": { lat: 35.6896, lng: 139.7005 },
  "東京車站": { lat: 35.6812, lng: 139.7671 },
  "淺草": { lat: 35.7100, lng: 139.7966 },
  "淺草雷門": { lat: 35.7100, lng: 139.7966 },
  "秋葉原": { lat: 35.7023, lng: 139.7731 },
  "上野": { lat: 35.7139, lng: 139.7745 },
  "押上": { lat: 35.7104, lng: 139.8132 },
  "晴空塔": { lat: 35.7101, lng: 139.8107 },
  "成田機場": { lat: 35.7720, lng: 140.3929 },
  "台場": { lat: 35.6239, lng: 139.7748 },
  "銀座": { lat: 35.6720, lng: 139.7610 },
  "原宿": { lat: 35.6705, lng: 139.7035 },
  "明治神宮": { lat: 35.6764, lng: 139.6993 },
  "吉祥寺": { lat: 35.7020, lng: 139.5733 },
  "下北澤": { lat: 35.6614, lng: 139.6681 },
  "錦糸町": { lat: 35.6905, lng: 139.8144 },
};

const DEFAULT_LOCATION: LatLng = { lat: 35.6812, lng: 139.7671 };

function findLocation(name: string): LatLng {
  if (KNOWN_PLACES[name]) return KNOWN_PLACES[name];
  for (const [key, coord] of Object.entries(KNOWN_PLACES)) {
    if (name.includes(key) || key.includes(name)) return coord;
  }
  return DEFAULT_LOCATION;
}

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
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=zh-TW`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._googleMapsCallbacks.forEach((cb: () => void) => cb());
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any)._googleMapsLoading = false;
    };
    script.onerror = () => reject("Google Maps script failed");
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
        const origin = findLocation(originName);
        const dest = findLocation(destName);

        const map = new google.maps.Map(mapRef.current, {
          zoom: 13,
          center: { lat: (origin.lat + dest.lat) / 2, lng: (origin.lng + dest.lng) / 2 },
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          // 用全螢幕控制會把按鈕推到邊界外，關掉避免溢出
          fullscreenControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          zoomControlOptions: { position: google.maps.ControlPosition.RIGHT_BOTTOM },
          styles: [
            // 淡化街道，讓地鐵路線條更突出
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
        const directionsRenderer = new google.maps.DirectionsRenderer({ suppressMarkers: false });
        directionsRenderer.setMap(map);

        directionsService.route(
          {
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: dest.lat, lng: dest.lng },
            travelMode: google.maps.TravelMode.TRANSIT,
          },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (result: any, status: string) => {
            if (cancelled) return;
            if (status === "OK" && result) {
              directionsRenderer.setDirections(result);
            } else {
              // 路線規劃失敗，至少顯示兩個 marker
              new google.maps.Marker({
                position: { lat: origin.lat, lng: origin.lng },
                map,
                label: "起",
              });
              new google.maps.Marker({
                position: { lat: dest.lat, lng: dest.lng },
                map,
                label: "終",
              });
              const bounds = new google.maps.LatLngBounds();
              bounds.extend({ lat: origin.lat, lng: origin.lng });
              bounds.extend({ lat: dest.lat, lng: dest.lng });
              map.fitBounds(bounds);
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
