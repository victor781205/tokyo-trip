import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultPackingItems, PackingList } from "@/components/PackingList";

const mocks = vi.hoisted(() => ({
  updatePackingList: vi.fn(),
  packingList: [] as Array<{ id: string; name: string; packed: boolean; category: string }>,
}));

vi.mock("@/hooks/useTripState", () => ({
  useTripState: () => ({
    isLoaded: true,
    packingList: mocks.packingList,
    updatePackingList: mocks.updatePackingList,
  }),
}));

describe("PackingList empty state", () => {
  beforeEach(() => {
    mocks.updatePackingList.mockReset();
    mocks.packingList = [];
  });

  it("preserves an intentionally empty synced list", () => {
    render(<PackingList />);

    expect(screen.getByText("已打包 0 / 0 項物品")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "載入建議清單" })).toBeInTheDocument();
    expect(mocks.updatePackingList).not.toHaveBeenCalled();
  });

  it("creates the same deterministic identities for defaults on every device", () => {
    const first = createDefaultPackingItems();
    const second = createDefaultPackingItems();

    expect(second.map((item) => item.id)).toEqual(first.map((item) => item.id));
    expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
    expect(first.every((item) => item.id.startsWith("default:"))).toBe(true);
  });

  it("only restores suggested items after explicit confirmation", () => {
    render(<PackingList />);

    fireEvent.click(screen.getByRole("button", { name: "載入建議清單" }));
    expect(mocks.updatePackingList).toHaveBeenCalledTimes(1);
    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: typeof mocks.packingList) => typeof mocks.packingList;
    expect(updater([])).toEqual(
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

  it("merges missing suggestions without overwriting reservations or custom items", () => {
    const reservation = { id: "reservation:ghibli", name: "吉卜力門票", packed: true, category: "預約與門票" };
    const custom = { id: "custom-note", name: "Victor 的自訂物品", packed: true, category: "其他" };
    const existingDefault = { id: "existing-passport", name: "護照", packed: true, category: "證件" };
    mocks.packingList = [reservation, custom, existingDefault];
    render(<PackingList />);

    fireEvent.click(screen.getByRole("button", { name: /補上建議清單/ }));
    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: typeof mocks.packingList) => typeof mocks.packingList;
    const next = updater(mocks.packingList);

    expect(next).toEqual(expect.arrayContaining([reservation, custom, existingDefault]));
    expect(next.filter((item) => item.name === "護照" && item.category === "證件")).toHaveLength(1);
    expect(next).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "行動電源（最多 2 顆、每顆 ≤100Wh；隨身攜帶）" }),
    ]));
  });

  it("hides the restore button once every default exists even when custom tasks remain", () => {
    mocks.packingList = [
      ...createDefaultPackingItems(),
      { id: "reservation:teamlab", name: "teamLab 門票", packed: false, category: "預約與門票" },
    ];
    render(<PackingList />);

    expect(screen.queryByRole("button", { name: /建議清單/ })).not.toBeInTheDocument();
  });

  it("keeps reservation state out of packing progress and bulk reset", () => {
    const packedReservation = {
      id: "reservation:ghibli",
      name: "吉卜力門票",
      packed: true,
      category: "預約與門票",
    };
    const packedLuggage = { id: "passport", name: "護照", packed: true, category: "證件" };
    const unpackedLuggage = { id: "umbrella", name: "摺疊傘", packed: false, category: "其他" };
    mocks.packingList = [packedReservation, packedLuggage, unpackedLuggage];
    render(<PackingList />);

    expect(screen.getByText("已打包 1 / 2 項物品")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.queryByText("吉卜力門票")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "全部消勾" }));
    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: typeof mocks.packingList) => typeof mocks.packingList;
    expect(updater(mocks.packingList)).toEqual([
      packedReservation,
      { ...packedLuggage, packed: false },
      unpackedLuggage,
    ]);
  });

  it("preserves hidden reservation tasks when editing physical luggage", () => {
    const reservation = {
      id: "reservation:teamlab",
      name: "teamLab 門票",
      packed: true,
      category: "預約與門票",
    };
    const luggage = { id: "passport", name: "護照", packed: false, category: "證件" };
    mocks.packingList = [reservation, luggage];
    render(<PackingList />);

    fireEvent.click(screen.getByRole("button", { name: "標記「護照」為已打包" }));
    const updater = mocks.updatePackingList.mock.calls[0][0] as (items: typeof mocks.packingList) => typeof mocks.packingList;
    expect(updater(mocks.packingList)).toEqual([reservation, { ...luggage, packed: true }]);
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

  it("announces whether each packing category is expanded", () => {
    mocks.packingList = [
      { id: "passport", name: "護照", packed: false, category: "證件" },
    ];
    render(<PackingList />);

    const categoryButton = screen.getByRole("button", { name: /證件/ });
    const panelId = categoryButton.getAttribute("aria-controls");
    expect(categoryButton).toHaveAttribute("aria-expanded", "true");
    expect(panelId).toBeTruthy();
    expect(document.getElementById(panelId!)).not.toHaveAttribute("hidden");

    fireEvent.click(categoryButton);
    expect(categoryButton).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById(panelId!)).toHaveAttribute("hidden");
  });
});
