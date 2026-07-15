import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Food } from "@/components/Food";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve(true)),
  updateCustomFoods: vi.fn(),
  updateItinerary: vi.fn(),
  updateFoodStatuses: vi.fn(),
  itinerary: {} as Record<string, {
    title: string;
    date: string;
    activities: Array<{ time: string; name: string; desc: string; tag: string; sourceId?: string; syncId?: string }>;
  }>,
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    customFoods: [],
    updateCustomFoods: mocks.updateCustomFoods,
    itinerary: mocks.itinerary,
    updateItinerary: mocks.updateItinerary,
    foodStatuses: {},
    updateFoodStatuses: mocks.updateFoodStatuses,
  }),
}));

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({ confirm: mocks.confirm, alert: mocks.alert }),
}));

describe("Food error and status states", () => {
  const originalKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  beforeEach(() => {
    mocks.alert.mockClear();
    mocks.confirm.mockClear();
    mocks.updateCustomFoods.mockClear();
    mocks.updateItinerary.mockClear();
    mocks.updateFoodStatuses.mockClear();
    mocks.itinerary = {};
    sessionStorage.clear();
    document.getElementById("google-maps-script")?.remove();
    delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    if (originalKey === undefined) delete process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    else process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY = originalKey;
  });

  it("uses a neutral hours label instead of claiming every restaurant is open", () => {
    render(<Food />);

    expect(screen.queryByText("🟢 營業中")).not.toBeInTheDocument();
    expect(screen.getAllByText("營業時間請以店家公告為準").length).toBeGreaterThan(0);
  });

  it("surfaces map load failure with retry and an external fallback", async () => {
    render(<Food />);
    fireEvent.click(screen.getByRole("button", { name: /顯示地圖/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Google Maps 無法載入");
    expect(screen.getByRole("button", { name: "重新載入" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "開啟 Google Maps" })).toHaveAttribute("target", "_blank");
  });

  it("checks the API response and uses the app dialog for URL analysis errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: vi.fn().mockResolvedValue({ error: "upstream failed" }),
    }));

    render(<Food />);
    fireEvent.change(screen.getByLabelText("自動解析（選擇性）"), {
      target: { value: "https://maps.app.goo.gl/example" },
    });

    await waitFor(() => expect(mocks.alert).toHaveBeenCalledTimes(1), { timeout: 1_500 });
    expect(mocks.alert).toHaveBeenCalledWith(expect.objectContaining({
      title: "分析失敗",
      message: expect.stringContaining("手動填寫"),
    }));
  });

  it("searches every category and exposes pressed state for district filters", () => {
    render(<Food />);

    fireEvent.change(screen.getByRole("searchbox", { name: "搜尋所有分類的餐廳" }), {
      target: { value: "寿司大" },
    });
    expect(screen.getByText("寿司大")).toBeInTheDocument();
    expect(screen.queryByText("一蘭 渋谷店")).not.toBeInTheDocument();

    const toyosu = screen.getByRole("button", { name: "豐洲" });
    fireEvent.click(toyosu);
    expect(toyosu).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/跨全部料理搜尋/)).toBeInTheDocument();
  });

  it("preserves an existing scheduled meal time when reopening its dialog", () => {
    mocks.itinerary = {
      day2: {
        title: "Day 2",
        date: "9/2",
        activities: [{
          time: "18:45",
          name: "用餐：一蘭 渋谷店",
          desc: "澀谷 · 可依喜好調整湯頭、辣度與麵條硬度的豚骨拉麵。",
          tag: "美食",
        }],
      },
    };
    render(<Food />);

    fireEvent.click(screen.getByRole("button", { name: "將「一蘭 渋谷店」排入行程" }));
    expect(screen.getByLabelText("安排日期")).toHaveValue("day2");
    expect(screen.getByLabelText("用餐時間")).toHaveValue("18:45");
  });

  it("syncs wishlist status and can add a restaurant to a selected trip day", () => {
    render(<Food />);

    fireEvent.click(screen.getByRole("button", { name: "將「一蘭 渋谷店」標記為想吃" }));
    expect(mocks.updateFoodStatuses).toHaveBeenCalledTimes(1);
    const statusUpdater = mocks.updateFoodStatuses.mock.calls[0][0] as (value: Record<string, string>) => Record<string, string>;
    expect(Object.values(statusUpdater({}))).toEqual(["wishlist"]);

    fireEvent.click(screen.getByRole("button", { name: "將「一蘭 渋谷店」排入行程" }));
    fireEvent.change(screen.getByLabelText("安排日期"), { target: { value: "day2" } });
    fireEvent.change(screen.getByLabelText("用餐時間"), { target: { value: "18:30" } });
    fireEvent.click(screen.getByRole("button", { name: "排入行程" }));

    expect(mocks.updateItinerary).toHaveBeenCalledTimes(1);
    const itineraryUpdater = mocks.updateItinerary.mock.calls[0][0] as (value: Record<string, { activities: Array<{ name: string; time: string }> }>) => Record<string, { activities: Array<{ name: string; time: string }> }>;
    const next = itineraryUpdater({});
    expect(next.day2.activities).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "用餐：一蘭 渋谷店",
        time: "18:30",
        sourceId: expect.stringMatching(/^food:recommended:/),
      }),
    ]));
  });

  it("traps modal focus, closes on Escape, and returns focus to the schedule trigger", () => {
    render(<Food />);
    const trigger = screen.getByRole("button", { name: "將「一蘭 渋谷店」排入行程" });
    fireEvent.click(trigger);

    const dialog = screen.getByRole("dialog", { name: "一蘭 渋谷店" });
    expect(dialog).toHaveAttribute("aria-describedby", "food-schedule-description");
    expect(screen.getByLabelText("安排日期")).toHaveFocus();

    const close = screen.getByRole("button", { name: "關閉排入行程視窗" });
    close.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(screen.getByRole("button", { name: "排入行程" })).toHaveFocus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("removes only the matching legacy scheduled food and preserves same-name activities", () => {
    const legacyTarget = {
      time: "12:00",
      name: "用餐：一蘭 渋谷店",
      desc: "澀谷 · 可依喜好調整湯頭、辣度與麵條硬度的豚骨拉麵。",
      tag: "美食",
    };
    const handWritten = { ...legacyTarget, time: "14:00", desc: "朋友手動建立的同名活動" };
    const otherSource = { ...legacyTarget, time: "16:00", sourceId: "food:recommended:another-location" };
    mocks.itinerary = {
      day1: { title: "Day 1", date: "9/1", activities: [legacyTarget, handWritten, otherSource] },
    };
    render(<Food />);

    fireEvent.click(screen.getByRole("button", { name: "將「一蘭 渋谷店」排入行程" }));
    fireEvent.click(screen.getByRole("button", { name: "從行程移除" }));

    const updater = mocks.updateItinerary.mock.calls[0][0] as (value: typeof mocks.itinerary) => typeof mocks.itinerary;
    const next = updater(mocks.itinerary);
    expect(next.day1.activities).toEqual([handWritten, otherSource]);
  });

  it("exposes duplicate cross-day schedules and consolidates them explicitly", () => {
    const sourceId = `food:recommended:${encodeURIComponent("一蘭 渋谷店")}:${encodeURIComponent("澀谷")}`;
    const scheduled = {
      time: "12:00",
      name: "用餐：一蘭 渋谷店",
      desc: "澀谷 · 可依喜好調整湯頭、辣度與麵條硬度的豚骨拉麵。",
      tag: "美食",
      sourceId,
    };
    mocks.itinerary = {
      day1: { title: "Day 1", date: "9/1", activities: [scheduled] },
      day3: { title: "Day 3", date: "9/3", activities: [{ ...scheduled, time: "19:00" }] },
    };
    render(<Food />);

    expect(screen.getByText("重複安排 D1、D3")).toBeInTheDocument();
    const trigger = screen.getByRole("button", { name: /一蘭 渋谷店.*目前重複排在 D1、D3/ });
    expect(trigger).toHaveTextContent("2 日重複");
    fireEvent.click(trigger);

    expect(screen.getByRole("alert")).toHaveTextContent("目前重複排在 D1、D3");
    fireEvent.click(screen.getByRole("button", { name: "合併為單一安排" }));

    const updater = mocks.updateItinerary.mock.calls[0][0] as (value: typeof mocks.itinerary) => typeof mocks.itinerary;
    const next = updater(mocks.itinerary);
    const matching = Object.entries(next).flatMap(([dayKey, day]) => (
      day.activities.filter((activity) => activity.name === "用餐：一蘭 渋谷店").map((activity) => ({ dayKey, activity }))
    ));
    expect(matching).toHaveLength(1);
    expect(matching[0]).toMatchObject({
      dayKey: "day1",
      activity: {
        sourceId: expect.stringMatching(/^food:recommended:geo:/),
        syncId: expect.stringMatching(/^source:/),
      },
    });
  });
});
