import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getForecastScopeNotice, WeatherForecast } from "@/components/WeatherForecast";
import { TodayFocus, pushHintForSnapshot } from "@/components/TodayFocus";
import { DEFAULT_ITINERARY } from "@/lib/default-itinerary";
import type { TokyoForecastDay } from "@/lib/jma-forecast";
import type { Itinerary } from "@/hooks/useTripState";

const weatherResponse = (forecast: TokyoForecastDay[] = [
  { date: "9/1", weather: "100", tempMax: "30", tempMin: "22", pop: "20" },
]) => ({ forecast });

const tripStateMocks = vi.hoisted(() => ({
  updateItinerary: vi.fn(),
  itinerary: {} as Itinerary,
  packingList: [] as Array<{ id: string; name: string; packed: boolean; category: string }>,
}));
const updateItineraryMock = tripStateMocks.updateItinerary;

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    tripId: "trip-test",
    itinerary: tripStateMocks.itinerary,
    budgetItems: [],
    budgetLimit: 100_000,
    packingList: tripStateMocks.packingList,
    updateItinerary: updateItineraryMock,
  }),
}));

beforeEach(() => {
  tripStateMocks.itinerary = {};
  tripStateMocks.packingList = [];
});

describe("weather failure states", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("shows a retryable JMA error and recovers on retry", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue(weatherResponse()),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherForecast />);
    expect(await screen.findByRole("alert")).toHaveTextContent("無法取得日本氣象廳資料");

    fireEvent.click(screen.getByRole("button", { name: "重新取得天氣" }));
    expect(await screen.findByText("9/1")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not leave Today Focus saying weather is loading after JMA fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    render(<TodayFocus />);

    await waitFor(() => {
      expect(screen.getByText(/東京天氣暫時無法取得/)).toBeInTheDocument();
    });
    expect(screen.queryByText("東京天氣載入中…")).not.toBeInTheDocument();
  });

  it("renders a 50% precipitation chance and labels 400-series weather as snow", async () => {
    const forecast = [
      { date: "9/1", weather: "400", tempMax: "3", tempMin: "-1", pop: "50" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse(forecast)),
    }));

    render(<WeatherForecast />);

    expect(await screen.findByLabelText("天氣：雪")).toHaveAttribute("role", "img");
    expect(screen.getByText("☔ 50%")).toBeInTheDocument();
    expect(screen.getByText(/本週有降雨機率/)).toBeInTheDocument();
  });

  it("keeps the first three days compact on mobile and exposes the rest with a disclosure", async () => {
    const forecast = Array.from({ length: 5 }, (_, index) => ({
      date: `9/${index + 1}`,
      weather: "100",
      tempMax: "30",
      tempMin: "22",
      pop: "20",
    }));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse(forecast)),
    }));

    render(<WeatherForecast />);

    const disclosure = await screen.findByRole("button", { name: "查看其餘 2 天" });
    const fourthCard = screen.getByText("9/4").parentElement;
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(disclosure).toHaveAttribute("aria-controls", "weather-forecast-days");
    expect(fourthCard).toHaveClass("hidden", "sm:flex");

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(disclosure).toHaveTextContent("收起完整預報");
    expect(fourthCard).not.toHaveClass("hidden");
  });

  it("renders the first day's observed high and low instead of empty placeholders", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse([{
        date: "7/14",
        weather: "111",
        tempMax: "33.4",
        tempMin: "24.2",
        pop: "10",
        temperatureNote: "今日低溫、高溫為截至 18:20 實測值",
      }])),
    }));

    render(<WeatherForecast />);

    expect(await screen.findByText("33.4°")).toBeInTheDocument();
    expect(screen.getByText("24.2°")).toBeInTheDocument();
    expect(screen.getByText(/截至 18:20 實測值/)).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/weather");
  });

  it("uses the same snow label in Today Focus", async () => {
    const forecast = [
      { date: "9/1", weather: "400", tempMax: "3", tempMin: "-1", pop: "50" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse(forecast)),
    }));

    render(<TodayFocus />);

    expect(await screen.findByText(/東京今日 雪/)).toBeInTheDocument();
  });
});

describe("weather forecast scope", () => {
  it("explains before departure that the cards are the current week, not trip dates", () => {
    expect(getForecastScopeNotice(new Date("2026-07-14T12:00:00+08:00"))).toContain(
      "並非 9/1–9/6 的旅程預報",
    );
    expect(getForecastScopeNotice(new Date("2026-09-02T12:00:00+09:00"))).toBeNull();
  });
});

describe("Today Focus push hint", () => {
  it("does not claim push is active from permission alone", () => {
    expect(pushHintForSnapshot({
      supported: true,
      permission: "granted",
      hasSubscription: false,
      backendRegistered: false,
    })).toContain("尚未完成推播訂閱");

    expect(pushHintForSnapshot({
      supported: true,
      permission: "granted",
      hasSubscription: true,
      backendRegistered: false,
    })).toContain("尚未綁定此行程");
  });

  it("only reports push as active with a subscription and backend registration", () => {
    expect(pushHintForSnapshot({
      supported: true,
      permission: "granted",
      hasSubscription: true,
      backendRegistered: true,
    })).toBe("推播已開啟 · 出發日可收提醒");
  });
});

describe("Today Focus packing progress", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("does not count synchronized reservation tasks as luggage", async () => {
    tripStateMocks.packingList = [
      { id: "passport", name: "護照", packed: true, category: "證件" },
      { id: "umbrella", name: "摺疊傘", packed: false, category: "其他" },
      { id: "reservation:ghibli", name: "吉卜力門票", packed: true, category: "預約與門票" },
    ];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse()),
    }));

    render(<TodayFocus />);

    expect(await screen.findByRole("button", { name: /行李進度\s*50%/ })).toBeInTheDocument();
  });
});

describe("Today Focus travel progress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    updateItineraryMock.mockClear();
    vi.setSystemTime(new Date("2026-09-02T10:00:00+09:00"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue(weatherResponse()),
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("preserves every default day when the first progress update starts from empty storage", () => {
    render(<TodayFocus />);

    fireEvent.click(screen.getByRole("button", { name: "標記完成" }));

    const updater = updateItineraryMock.mock.calls[0]?.[0] as ((current: object) => Record<string, unknown>);
    const next = updater({});
    expect(Object.keys(next)).toEqual(["day1", "day2", "day3", "day4", "day5", "day6"]);
    expect(next.day1).toBeDefined();
    expect(next.day6).toBeDefined();
    expect(next.day2).toMatchObject({
      activities: expect.arrayContaining([
        expect.objectContaining({ name: "明治神宮", status: "done" }),
      ]),
    });

    const recovered = updater({ day2: next.day2 });
    expect(Object.keys(recovered)).toEqual(["day1", "day2", "day3", "day4", "day5", "day6"]);
  });

  it.each([
    { buttonName: "標記完成", expectedStatus: "done" },
    { buttonName: "略過", expectedStatus: "skipped" },
  ] as const)(
    "does not jump back to an earlier unchecked activity after $expectedStatus",
    ({ buttonName, expectedStatus }) => {
      const { rerender } = render(<TodayFocus />);
      expect(screen.getByText("目前行程")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: buttonName }));
      const updater = updateItineraryMock.mock.calls[0]?.[0] as ((current: Itinerary) => Itinerary);
      tripStateMocks.itinerary = updater({});
      rerender(<TodayFocus />);

      expect(
        tripStateMocks.itinerary.day2.activities.find((activity) => activity.name === "明治神宮"),
      ).toMatchObject({ status: expectedStatus });
      expect(screen.queryByText("目前行程")).not.toBeInTheDocument();
      expect(screen.getByText("下一站尚未開始，可以先確認路線。")).toBeInTheDocument();
      expect(screen.getByText(/11:30 · 原宿竹下通/)).toBeInTheDocument();
    },
  );

  it("uses Tokyo time and advances to the latest unprocessed stop after the progress cursor", () => {
    vi.setSystemTime(new Date("2026-09-02T02:45:00Z")); // 11:45 in Tokyo
    tripStateMocks.itinerary = {
      ...DEFAULT_ITINERARY,
      day2: {
        ...DEFAULT_ITINERARY.day2,
        activities: DEFAULT_ITINERARY.day2.activities.map((activity) => (
          activity.name === "明治神宮"
            ? { ...activity, status: "done" as const }
            : { ...activity }
        )),
      },
    };

    render(<TodayFocus />);

    const currentCard = screen.getByText("目前行程").parentElement;
    expect(currentCard).not.toBeNull();
    expect(within(currentCard!).getByText("原宿竹下通")).toBeInTheDocument();
    expect(within(currentCard!).queryByText("飯店早餐")).not.toBeInTheDocument();
    expect(screen.getByText(/13:00 · 午餐：拉麵/)).toBeInTheDocument();
  });
});
