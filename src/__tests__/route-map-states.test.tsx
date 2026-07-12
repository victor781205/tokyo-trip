import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteMap, isHotelOrKinshichoOrigin } from "@/components/RouteMap";

const mocks = vi.hoisted(() => ({
  itinerary: {} as Record<string, unknown>,
}));

vi.mock("next/dynamic", () => ({
  default: () => function MockRouteMapView() {
    return <div data-testid="route-map-view" />;
  },
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({ itinerary: mocks.itinerary }),
}));

describe("RouteMap state accuracy", () => {
  beforeEach(() => {
    mocks.itinerary = {};
  });

  it("falls back to the default itinerary when the synced itinerary is empty", () => {
    render(<RouteMap />);

    expect(screen.getByRole("button", { name: /依行程查詢路線/ })).toBeInTheDocument();
  });

  it("does not present hotel-based static fares for a custom origin", () => {
    render(<RouteMap />);

    fireEvent.change(screen.getByLabelText("起點"), { target: { value: "成田機場" } });
    fireEvent.click(screen.getByRole("button", { name: /澀谷/ }));

    expect(screen.getByText(/自訂起點車資/)).toBeInTheDocument();
    expect(screen.getByText("依路線而定")).toBeInTheDocument();
    expect(screen.queryByText("約 ¥260（Metro）")).not.toBeInTheDocument();
  });

  it("keeps the static reference fare for the hotel and Kinshicho origins", () => {
    expect(isHotelOrKinshichoOrigin("東京東武黎凡特飯店")).toBe(true);
    expect(isHotelOrKinshichoOrigin("JR Kinshicho Station")).toBe(true);
    expect(isHotelOrKinshichoOrigin("成田機場")).toBe(false);

    render(<RouteMap />);
    fireEvent.click(screen.getByRole("button", { name: /澀谷/ }));

    expect(screen.getAllByText("約 ¥260（Metro）").length).toBeGreaterThan(0);
  });
});
