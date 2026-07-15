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
  let cachePut: ReturnType<typeof vi.fn>;

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
    let cachedResponse: Response | undefined = new Response(JSON.stringify(pack), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    cachePut = vi.fn(async (_input: RequestInfo | URL, response: Response) => {
      cachedResponse = response.clone();
    });
    const cacheStorage = {
      open: vi.fn(async () => ({
        match: vi.fn(async () => cachedResponse?.clone()),
        put: cachePut,
        delete: vi.fn(async () => {
          cachedResponse = undefined;
          return true;
        }),
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

  it("previews a validated backup and writes it only after explicit confirmation", async () => {
    const importPack = createOfflineTripPack({
      tripId: "trip-viewer",
      itinerary: {
        day1: {
          title: "匯入預覽",
          date: "9/1",
          activities: [
            { time: "15:00", name: "東京車站", desc: "確認後才可離線讀取", tag: "景點" },
          ],
        },
      },
      budgetLimit: 180_000,
      budgetItems: [],
      packingList: [{ id: "passport", name: "護照", category: "證件", packed: false }],
      savedAt: new Date("2026-07-15T08:00:00Z"),
    });
    const file = new File(["backup"], "tokyo-backup.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: vi.fn(async () => JSON.stringify(importPack)),
    });

    render(<TravelToolkit />);
    fireEvent.change(screen.getByLabelText("匯入備份"), { target: { files: [file] } });

    expect(await screen.findByRole("heading", { name: "確認離線備份內容" })).toBeInTheDocument();
    expect(screen.getByText("180,000", { exact: false })).toBeInTheDocument();
    expect(screen.getByText("這不是完整的同步行程還原")).toBeInTheDocument();
    expect(screen.getByText(/不會覆蓋或上傳目前的同步行程/)).toBeInTheDocument();
    expect(cachePut).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "確認匯入為離線快照" }));

    expect(await screen.findByText("已匯入離線快照；同步行程未變更。")).toBeInTheDocument();
    expect(cachePut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("heading", { name: "可離線閱讀的旅行資料" })).toBeInTheDocument();
    expect(screen.getByText("東京車站")).toBeInTheDocument();
  });

  it("rejects another trip's backup before preview or cache writes", async () => {
    const otherTripPack = createOfflineTripPack({
      tripId: "another-trip",
      itinerary: {},
      budgetLimit: 100_000,
      budgetItems: [],
      packingList: [],
    });
    const file = new File(["backup"], "wrong-trip.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: vi.fn(async () => JSON.stringify(otherTripPack)),
    });

    render(<TravelToolkit />);
    fireEvent.change(screen.getByLabelText("匯入備份"), { target: { files: [file] } });

    expect(await screen.findByText("這份備份屬於另一趟行程；為避免混入錯誤資料，已停止匯入。")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "確認離線備份內容" })).not.toBeInTheDocument();
    expect(cachePut).not.toHaveBeenCalled();
  });
});
