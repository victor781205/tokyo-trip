import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWeatherFreshnessNotice,
  WeatherForecast,
} from "@/components/WeatherForecast";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("weather forecast freshness", () => {
  it("only warns after the JMA report exceeds the freshness window", () => {
    const updatedAt = "2026-07-14T17:00:00+09:00";

    expect(getWeatherFreshnessNotice(
      updatedAt,
      new Date("2026-07-15T10:00:00+09:00"),
    )).toBeNull();
    expect(getWeatherFreshnessNotice(
      updatedAt,
      new Date("2026-07-15T12:00:00+09:00"),
    )).toContain("19 小時未更新");
  });

  it("shows a refresh action when the API marks the source as stale", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          forecast: [
            { date: "7/15", weather: "101", tempMax: "34", tempMin: "25", pop: "20" },
          ],
          stale: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: vi.fn().mockResolvedValue({
          forecast: [
            { date: "7/15", weather: "101", tempMax: "34", tempMin: "25", pop: "20" },
          ],
          stale: false,
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<WeatherForecast />);

    expect(await screen.findByRole("status")).toHaveTextContent("預報目前標示為過期");
    expect(screen.getByRole("heading", { name: "本週穿搭參考" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "重新取得" }));
    await waitFor(() => {
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
