import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RouteMap, isHotelOrKinshichoOrigin } from "@/components/RouteMap";

const mocks = vi.hoisted(() => ({
  itinerary: {} as Record<string, unknown>,
}));

vi.mock("next/dynamic", () => ({
  default: () => function MockRouteMapView({ originName, destName }: { originName: string; destName: string }) {
    return <div data-testid="route-map-view">{originName} → {destName}</div>;
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

  it("exposes the itinerary route shortcuts as an accessible disclosure", () => {
    render(<RouteMap />);

    const disclosure = screen.getByRole("button", { name: /依行程查詢路線/ });
    const panelId = disclosure.getAttribute("aria-controls");
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).toHaveAttribute("hidden");

    fireEvent.click(disclosure);
    expect(disclosure).toHaveAttribute("aria-expanded", "true");
    expect(document.getElementById(panelId!)).not.toHaveAttribute("hidden");
  });

  it("describes Welcome Suica Mobile by official device compatibility", () => {
    render(<RouteMap />);

    expect(screen.getByText(/官方服務支援 Apple Pay 相容 iPhone/)).toBeInTheDocument();
    expect(screen.getByText(/其他裝置能否使用請依 JR 東日本最新相容性說明確認/)).toBeInTheDocument();
    expect(screen.queryByText(/海外版 Android 目前通常無法發行/)).not.toBeInTheDocument();
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

  it("keeps the rendered route, fare, and link on submitted values while drafts are edited", () => {
    render(<RouteMap />);

    fireEvent.change(screen.getByLabelText("目的地"), { target: { value: "澀谷" } });
    fireEvent.click(screen.getByRole("button", { name: "立即查詢路線" }));

    expect(screen.getByTestId("route-map-view")).toHaveTextContent("東京東武黎凡特飯店 → 澀谷");
    expect(screen.getAllByText("東京東武黎凡特飯店 → 澀谷")).toHaveLength(2);
    expect(screen.getAllByText("約 ¥260（Metro）").length).toBeGreaterThan(0);

    const navigationLink = screen.getByRole("link", { name: /開啟 Google Maps 導航/ });
    const submittedHref = navigationLink.getAttribute("href");

    fireEvent.change(screen.getByLabelText("起點"), { target: { value: "成田機場" } });
    fireEvent.change(screen.getByLabelText("目的地"), { target: { value: "新宿" } });

    expect(screen.getByTestId("route-map-view")).toHaveTextContent("東京東武黎凡特飯店 → 澀谷");
    expect(screen.getAllByText("東京東武黎凡特飯店 → 澀谷")).toHaveLength(2);
    expect(screen.getAllByText("約 ¥260（Metro）").length).toBeGreaterThan(0);
    expect(navigationLink).toHaveAttribute("href", submittedHref);

    fireEvent.click(screen.getByRole("button", { name: "立即查詢路線" }));

    expect(screen.getByTestId("route-map-view")).toHaveTextContent("成田機場 → 新宿");
    expect(screen.getAllByText("成田機場 → 新宿")).toHaveLength(2);
    expect(screen.getByText(/自訂起點車資/)).toBeInTheDocument();
    expect(navigationLink.getAttribute("href")).not.toBe(submittedHref);
  });

  it("trims submitted values and exposes accessible validation errors", () => {
    render(<RouteMap />);

    fireEvent.change(screen.getByLabelText("起點"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "立即查詢路線" }));

    expect(screen.getByRole("alert")).toHaveTextContent("請輸入起點");
    expect(screen.getByLabelText("起點")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByTestId("route-map-view")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("起點"), { target: { value: "  東京車站  " } });
    fireEvent.change(screen.getByLabelText("目的地"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "立即查詢路線" }));

    expect(screen.getByRole("alert")).toHaveTextContent("請輸入目的地");
    expect(screen.getByLabelText("目的地")).toHaveAttribute("aria-invalid", "true");

    fireEvent.change(screen.getByLabelText("目的地"), { target: { value: "  澀谷  " } });
    fireEvent.click(screen.getByRole("button", { name: "立即查詢路線" }));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("route-map-view")).toHaveTextContent("東京車站 → 澀谷");
  });

  it("submits quick spots immediately and clears submitted results when closed", () => {
    render(<RouteMap />);

    fireEvent.click(screen.getByRole("button", { name: /澀谷/ }));
    expect(screen.getByTestId("route-map-view")).toHaveTextContent("東京東武黎凡特飯店 → 澀谷");

    fireEvent.click(screen.getByRole("button", { name: "關閉路線結果" }));
    expect(screen.queryByTestId("route-map-view")).not.toBeInTheDocument();
    expect(screen.getByText("常用車資參考（從飯店出發）")).toBeInTheDocument();
  });
});
