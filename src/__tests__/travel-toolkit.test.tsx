import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TravelToolkit } from "@/components/TravelToolkit";
import { createOfflineTripPack } from "@/lib/offline-pack";

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    tripId: "trip-viewer",
    itinerary: {
      day1: {
        title: "抵達東京",
        date: "9/1",
        activities: [
          { time: "12:55", name: "抵達成田機場", desc: "入境", tag: "交通" },
        ],
      },
    },
    budgetItems: [],
    budgetLimit: 100_000,
    packingList: [{ id: "passport", name: "護照", category: "證件", packed: true }],
  }),
}));

describe("TravelToolkit offline viewer", () => {
  const originalCaches = Object.getOwnPropertyDescriptor(window, "caches");

  beforeEach(() => {
    const pack = createOfflineTripPack({
      tripId: "trip-viewer",
      itinerary: {
        day1: {
          title: "抵達東京",
          date: "9/1",
          activities: [{ time: "12:55", name: "抵達成田機場", desc: "入境", tag: "交通" }],
        },
      },
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [{ id: "passport", name: "護照", category: "證件", packed: true }],
      savedAt: new Date("2026-07-14T10:00:00Z"),
    });
    const cacheStorage = {
      open: vi.fn(async () => ({
        match: vi.fn(async () => new Response(JSON.stringify(pack), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })),
      })),
    } as unknown as CacheStorage;
    Object.defineProperty(window, "caches", {
      configurable: true,
      value: cacheStorage,
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalCaches) Object.defineProperty(window, "caches", originalCaches);
    else Reflect.deleteProperty(window, "caches");
  });

  it("opens and presents the verified cached pack without a network request", async () => {
    render(<TravelToolkit />);

    const openButton = await screen.findByRole("button", { name: "開啟離線包" });
    await waitFor(() => expect(openButton).toBeEnabled());
    fireEvent.click(openButton);

    expect(await screen.findByRole("heading", { name: "可離線閱讀的旅行資料" })).toBeInTheDocument();
    expect(screen.getByText("〒130-0013 東京都墨田区錦糸1丁目2番2号")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /警察 · 110/ })).toHaveAttribute("href", "tel:110");
    expect(screen.getByText("抵達成田機場")).toBeInTheDocument();
    expect(screen.getByText("このホテルまで連れて行ってください。")).toBeInTheDocument();
  });
});
