/* eslint-disable @typescript-eslint/no-explicit-any */
// Google Maps 動態載入的型別宣告（非 npm 安裝，透過 script 標籤載入）

declare namespace google {
  namespace maps {
    class Map {
      constructor(element: HTMLElement, options?: any);
      fitBounds(bounds: LatLngBounds, padding?: number): void;
    }

    class LatLngBounds {
      constructor();
      extend(point: LatLngLiteral | LatLng): LatLngBounds;
    }

    interface LatLngLiteral {
      lat: number;
      lng: number;
    }

    class LatLng {
      constructor(lat: number, lng: number);
    }

    class InfoWindow {
      constructor(options?: any);
      setContent(content: string | Element | null): void;
      open(map?: Map, anchor?: any): void;
    }

    namespace marker {
      class AdvancedMarkerElement {
        constructor(options?: any);
        addListener(eventName: string, handler: () => void): void;
        map: Map | null;
      }
    }

    namespace event {
      function addListenerOnce(target: any, eventName: string, handler: () => void): void;
    }
  }
}

interface Window {
  google?: typeof google;
}
