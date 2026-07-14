import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getForecastScopeNotice, WeatherForecast } from "@/components/WeatherForecast";
import { TodayFocus, pushHintForSnapshot } from "@/components/TodayFocus";
import type { TokyoForecastDay } from "@/lib/jma-forecast";

const weatherResponse = (forecast: TokyoForecastDay[] = [
  { date: "9/1", weather: "100", tempMax: "30", tempMin: "22", pop: "20" },
]) => ({ forecast });

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    tripId: "trip-test",
    itinerary: {},
    budgetItems: [],
    budgetLimit: 100_000,
    packingList: [],
  }),
}));

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

    expect(await screen.findByLabelText("天氣：雪")).toBeInTheDocument();
    expect(screen.getByText("☔ 50%")).toBeInTheDocument();
    expect(screen.getByText(/本週有降雨機率/)).toBeInTheDocument();
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
