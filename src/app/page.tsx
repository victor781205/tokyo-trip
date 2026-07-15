"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { Navigation } from "@/components/Navigation";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { PushSubscriptionPrompt } from "@/components/PushSubscriptionPrompt";
import { SectionAnchors } from "@/components/SectionAnchors";
import { TodayFocus } from "@/components/TodayFocus";
import { TravelModeDock } from "@/components/TravelModeDock";
import { useTrip } from "@/context/TripContext";
import { CategoryMasthead, type CategoryTab } from "@/components/CategoryMasthead";
import { BellRing } from "lucide-react";
import { Hero } from "@/components/Hero";
import { TokyoMark } from "@/components/TokyoBrand";

const VALID_TABS = new Set([
  "hero",
  "flights",
  "tripprep",
  "transport",
  "itinerary",
  "tools",
  "food",
  "assistant",
]);

const TAB_TITLES: Record<string, string> = {
  flights: "航班資訊",
  tripprep: "行前準備",
  transport: "住宿與交通",
  itinerary: "東京六天行程",
  tools: "旅程工具",
  food: "東京美食",
  assistant: "旅遊助手",
};

function resolveTab(value: string | null | undefined): string {
  return value && VALID_TABS.has(value) ? value : "hero";
}

function TabLoading() {
  return (
    <div className="py-16 flex flex-col items-center justify-center gap-3 text-gray-400">
      <div className="h-8 w-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
      <p className="text-sm font-medium">載入中…</p>
    </div>
  );
}

function lazyNamed<TProps extends object>(
  loader: () => Promise<ComponentType<TProps>>,
) {
  return dynamic(
    async () => {
      const Comp = await loader();
      return { default: Comp };
    },
    {
      ssr: false,
      loading: () => <TabLoading />,
    },
  );
}

// 首頁 Hero 保留 SSR 以穩定首屏；其餘大型分類按需載入，降低首屏 bundle。
const FlightInfo = lazyNamed(() =>
  import("@/components/FlightInfo").then((m) => m.FlightInfo),
);
const HotelInfo = lazyNamed(() =>
  import("@/components/HotelInfo").then((m) => m.HotelInfo),
);
const RouteMap = lazyNamed(() =>
  import("@/components/RouteMap").then((m) => m.RouteMap),
);
const Itinerary = lazyNamed<{ onNavigate?: (tab: string) => void }>(() =>
  import("@/components/Itinerary").then((m) => m.Itinerary),
);
const BudgetTracker = lazyNamed(() =>
  import("@/components/BudgetTracker").then((m) => m.BudgetTracker),
);
const CurrencyConverter = lazyNamed(() =>
  import("@/components/CurrencyConverter").then((m) => m.CurrencyConverter),
);
const WeatherForecast = lazyNamed(() =>
  import("@/components/WeatherForecast").then((m) => m.WeatherForecast),
);
const Food = lazyNamed(() =>
  import("@/components/Food").then((m) => m.Food),
);
const Tips = lazyNamed(() =>
  import("@/components/Tips").then((m) => m.Tips),
);
const EmergencyContacts = lazyNamed(() =>
  import("@/components/EmergencyContacts").then((m) => m.EmergencyContacts),
);
const PackingList = lazyNamed(() =>
  import("@/components/PackingList").then((m) => m.PackingList),
);
const ReservationChecklist = lazyNamed(() =>
  import("@/components/ReservationChecklist").then((m) => m.ReservationChecklist),
);
const TravelToolkit = lazyNamed(() =>
  import("@/components/TravelToolkit").then((m) => m.TravelToolkit),
);
const JapanesePhrases = lazyNamed(() =>
  import("@/components/JapanesePhrases").then((m) => m.JapanesePhrases),
);

function HomeContent() {
  // 以 state 驅動 tab；初始固定 hero，client 再讀 deep link，避免 hydration mismatch。
  const [activeTab, setActiveTab] = useState("hero");
  const { tripId, tripSecret } = useTrip();
  const contentRef = useRef<HTMLDivElement>(null);
  const previousTabRef = useRef("hero");

  /** 讀取目前 URL 的 tab（含 history / deep link）。 */
  const readTabFromLocation = useCallback(() => {
    if (typeof window === "undefined") return "hero";
    const params = new URLSearchParams(window.location.search);
    return resolveTab(params.get("tab"));
  }, []);

  /** 首次 mount 與瀏覽器前進/後退時，與 URL 同步。 */
  useEffect(() => {
    const syncFromUrl = () => {
      setActiveTab(readTabFromLocation());
    };
    // 延後到 timeout，避免 effect 內同步 setState 觸發 lint / cascading render。
    const timer = window.setTimeout(syncFromUrl, 0);
    window.addEventListener("popstate", syncFromUrl);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("popstate", syncFromUrl);
    };
  }, [readTabFromLocation]);

  /** URL 與 state 同步，讓 deep link、返回鍵與畫面保持一致。 */
  const handleSetActiveTab = useCallback((id: string) => {
    const next = resolveTab(id);
    setActiveTab(next);
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (next === "hero") {
      params.delete("tab");
    } else {
      params.set("tab", next);
    }
    const query = params.toString();
    const nextUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextUrl !== currentUrl) {
      window.history.pushState({ tab: next }, "", nextUrl);
    }
  }, []);

  // 分類真的變更後回到頂端，並把鍵盤焦點交給新內容區。
  useEffect(() => {
    if (previousTabRef.current === activeTab) return;
    previousTabRef.current = activeTab;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "auto" });
      contentRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeTab]);

  const renderContent = (): ReactNode => {
    switch (activeTab) {
      case "hero":
        return (
          <>
            <Hero
              onNavigate={handleSetActiveTab}
              pushControls={<PushSubscriptionPrompt tripId={tripId} tripSecret={tripSecret} />}
            />
            {/* 今日焦點：放在全螢幕 Hero 下方，可自然往下捲 */}
            <div className="relative z-10 px-4 pb-10 -mt-2 sm:-mt-4">
              <TodayFocus onNavigate={handleSetActiveTab} />
            </div>
          </>
        );
      case "flights":
        return <FlightInfo />;
      case "tripprep":
        return (
          <div>
            <SectionAnchors
              items={[
                { id: "weather", label: "天氣", emoji: "🌤️" },
                { id: "reservations", label: "預約", emoji: "🎟️" },
                { id: "travel-kit", label: "離線與備案", emoji: "🛡️" },
                { id: "packing", label: "行李", emoji: "🧳" },
              ]}
            />
            <WeatherForecast />
            <ReservationChecklist />
            <TravelToolkit />
            <div className="mt-2">
              <PackingList />
            </div>
          </div>
        );
      case "transport":
        return (
          <div className="space-y-4 md:space-y-6">
            <SectionAnchors
              items={[
                { id: "hotel", label: "住宿", emoji: "🏨" },
                { id: "routemap", label: "路線", emoji: "🗺️" },
              ]}
            />
            <HotelInfo />
            <RouteMap />
          </div>
        );
      case "itinerary":
        return <Itinerary onNavigate={handleSetActiveTab} />;
      case "tools":
        return (
          <div className="space-y-4 md:space-y-6">
            <SectionAnchors
              items={[
                { id: "budget", label: "預算", emoji: "💰" },
                { id: "currency", label: "匯率", emoji: "💱" },
              ]}
            />
            <BudgetTracker />
            <CurrencyConverter />
          </div>
        );
      case "food":
        return <Food />;
      case "assistant":
        return (
          <div className="space-y-4 md:space-y-6">
            <SectionAnchors
              items={[
                { id: "emergency", label: "緊急", emoji: "🆘" },
                { id: "phrases", label: "日語", emoji: "🗣️" },
                { id: "tips", label: "Tips", emoji: "💡" },
              ]}
            />
            <aside className="assistant-push-panel" aria-label="行程提醒設定">
              <div className="assistant-push-panel__icon" aria-hidden="true">
                <BellRing className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-black text-slate-950 dark:text-white">每天早上，把第一站送到手機</p>
                <p className="mt-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">旅遊助手現在可直接開啟行程提醒，不必再回首頁尋找設定。</p>
              </div>
              <div className="shrink-0">
                <PushSubscriptionPrompt tripId={tripId} tripSecret={tripSecret} />
              </div>
            </aside>
            <EmergencyContacts />
            <JapanesePhrases />
            <Tips />
          </div>
        );
      default:
        return (
          <>
            <Hero
              onNavigate={handleSetActiveTab}
              pushControls={<PushSubscriptionPrompt tripId={tripId} tripSecret={tripSecret} />}
            />
            <div className="relative z-10 px-4 pb-10 -mt-2 sm:-mt-4">
              <TodayFocus onNavigate={handleSetActiveTab} />
            </div>
          </>
        );
    }
  };

  return (
    <main
      data-tab={activeTab}
      className="trip-shell flex flex-col min-h-dvh pt-[calc(4rem+var(--sat))] pb-[calc(4.25rem+var(--sab))] lg:pb-0 transition-colors duration-500"
    >
      <Navigation activeTab={activeTab} setActiveTab={handleSetActiveTab} />
      <TravelModeDock onNavigate={handleSetActiveTab} />

      <div
        ref={contentRef}
        id="tab-content"
        tabIndex={-1}
        aria-label={`${activeTab === "hero" ? "首頁" : "目前分類"}內容`}
        className="outline-none flex flex-col flex-1"
      >
        {activeTab === "hero" ? (
          <>
            <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              {renderContent()}
            </div>
            <OfflineIndicator />
          </>
        ) : (
          <>
            <div className="trip-page-frame flex-1 max-w-7xl mx-auto py-5 sm:py-8 w-full">
              <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                <CategoryMasthead tab={activeTab as CategoryTab} />
                <div className="category-content" aria-label={`${TAB_TITLES[activeTab] ?? "東京自由行"}內容`}>
                  {renderContent()}
                </div>
              </div>
            </div>

            <OfflineIndicator />

            <footer className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 pt-8 pb-[calc(2rem+var(--sab))] text-center text-sm transition-colors mt-auto">
              <div className="max-w-4xl mx-auto px-6">
                <h3 className="mb-3 flex items-center justify-center gap-2 text-xl font-bold text-primary"><TokyoMark className="h-7 w-6" />東京自由行行程規劃</h3>
                <div className="flex flex-wrap justify-center gap-2 sm:gap-6 mb-4 text-xs text-gray-500 font-bold">
                  <span>2026.09.01 - 09.06</span>
                  <span>•</span>
                  <span>Powered by Victor</span>
                </div>
                {activeTab !== "assistant" && (
                  <div className="mb-4 flex justify-center">
                    <PushSubscriptionPrompt tripId={tripId} tripSecret={tripSecret} />
                  </div>
                )}
                <p className="text-gray-400 opacity-60 text-xs">© 2026 Tokyo Trip Planner</p>
              </div>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}

export default function Home() {
  return <HomeContent />;
}
