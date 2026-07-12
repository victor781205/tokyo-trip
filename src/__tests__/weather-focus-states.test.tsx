import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WeatherForecast } from "@/components/WeatherForecast";
import { TodayFocus, pushHintForSnapshot } from "@/components/TodayFocus";

const mocks = vi.hoisted(() => ({
  parseTokyoForecast: vi.fn(),
}));

vi.mock("@/lib/jma-forecast", () => ({
  parseTokyoForecast: mocks.parseTokyoForecast,
}));

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
    mocks.parseTokyoForecast.mockReset();
    mocks.parseTokyoForecast.mockReturnValue([
      { date: "9/1", weather: "100", tempMax: "30", tempMin: "22", pop: "20" },
    ]);
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
        json: vi.fn().mockResolvedValue({}),
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
