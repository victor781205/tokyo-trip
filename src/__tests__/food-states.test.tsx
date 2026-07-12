import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Food } from "@/components/Food";

const mocks = vi.hoisted(() => ({
  alert: vi.fn(() => Promise.resolve()),
  confirm: vi.fn(() => Promise.resolve(true)),
  updateCustomFoods: vi.fn(),
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    customFoods: [],
    updateCustomFoods: mocks.updateCustomFoods,
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
});
