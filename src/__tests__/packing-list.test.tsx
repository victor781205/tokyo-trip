import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PackingList } from "@/components/PackingList";

const mocks = vi.hoisted(() => ({
  updatePackingList: vi.fn(),
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    packingList: [],
    updatePackingList: mocks.updatePackingList,
  }),
}));

describe("PackingList empty state", () => {
  beforeEach(() => {
    mocks.updatePackingList.mockReset();
  });

  it("preserves an intentionally empty synced list", () => {
    render(<PackingList />);

    expect(screen.getByText("已打包 0 / 0 項物品")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "載入建議清單" })).toBeInTheDocument();
    expect(mocks.updatePackingList).not.toHaveBeenCalled();
  });

  it("only restores suggested items after explicit confirmation", () => {
    render(<PackingList />);

    fireEvent.click(screen.getByRole("button", { name: "載入建議清單" }));
    expect(mocks.updatePackingList).toHaveBeenCalledTimes(1);
    expect(mocks.updatePackingList).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "護照", packed: false, category: "證件" }),
        expect.objectContaining({
          name: "行動電源（最多 2 顆、每顆 ≤100Wh；隨身攜帶）",
          packed: false,
          category: "電子用品",
        }),
      ]),
    );
  });

  it("shows season, plug, and lithium-battery guidance without refilling the list", () => {
    render(<PackingList />);

    expect(screen.getByText("👕 透氣短袖 4-5 件")).toBeInTheDocument();
    expect(screen.getByText("🔌 台灣兩扁腳通常可直接使用")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent(/2026\/4\/1.*最多 2 顆.*每顆 ≤100Wh.*不可託運.*機上禁止使用或充電.*不可放入頭頂置物櫃.*前方座椅下/);
    expect(screen.getByRole("link", { name: "查看星宇最新規定" })).toHaveAttribute(
      "href",
      expect.stringContaining("starlux-airlines.com"),
    );
    expect(mocks.updatePackingList).not.toHaveBeenCalled();
  });
});
