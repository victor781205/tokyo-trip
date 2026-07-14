import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TravelModeDock } from "@/components/TravelModeDock";

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    tripId: "trip-test",
    itinerary: {
      day2: {
        title: "Day 2",
        date: "9/2",
        activities: [
          { time: "08:00", name: "早餐", desc: "飯店", tag: "美食" },
          { time: "09:30", name: "明治神宮", desc: "散步", tag: "景點" },
          { time: "13:00", name: "午餐", desc: "拉麵", tag: "美食" },
        ],
      },
    },
  }),
}));

describe("TravelModeDock", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows the current and next activity during the trip", () => {
    vi.setSystemTime(new Date("2026-09-02T10:00:00+09:00"));
    render(<TravelModeDock />);

    const dock = screen.getByRole("complementary", { name: "旅行模式：下一站" });
    expect(dock).toBeInTheDocument();
    expect(dock).toHaveClass("lg:left-auto", "lg:bottom-5");
    expect(dock.className).not.toContain("md:left-auto");
    expect(screen.getByText(/13:00 · 午餐/)).toBeInTheDocument();
    expect(screen.getByText(/現在：明治神宮/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "開啟 午餐 導航" })).toHaveAttribute(
      "href",
      expect.stringContaining("google.com/maps/search"),
    );
  });

  it("stays out of the way before departure", () => {
    vi.setSystemTime(new Date("2026-07-14T10:00:00+08:00"));
    render(<TravelModeDock />);

    expect(screen.queryByRole("complementary", { name: "旅行模式：下一站" })).not.toBeInTheDocument();
  });
});
