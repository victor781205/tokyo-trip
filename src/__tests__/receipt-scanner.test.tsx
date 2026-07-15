import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseReceiptText, ReceiptScanner } from "@/components/ReceiptScanner";

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({ alert: vi.fn().mockResolvedValue(undefined) }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockCamera(getUserMedia: () => Promise<MediaStream>) {
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { getUserMedia: vi.fn(getUserMedia) },
  });
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
}

describe("ReceiptScanner camera", () => {
  it("renders the video after acquiring a stream and releases it on close", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    mockCamera(async () => stream);

    const onClose = vi.fn();
    const view = render(<ReceiptScanner onScanComplete={vi.fn()} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "拍照掃描" }));

    await waitFor(() => expect(view.container.querySelector("video")?.srcObject).toBe(stream));
    fireEvent.click(screen.getByRole("button", { name: "關閉發票掃描" }));
    expect(stop).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("stops a stream that resolves after the scanner has unmounted", async () => {
    const stop = vi.fn();
    const stream = { getTracks: () => [{ stop }] } as unknown as MediaStream;
    let resolveStream!: (value: MediaStream) => void;
    mockCamera(() => new Promise((resolve) => { resolveStream = resolve; }));

    const view = render(<ReceiptScanner onScanComplete={vi.fn()} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "拍照掃描" }));
    view.unmount();
    resolveStream(stream);

    await waitFor(() => expect(stop).toHaveBeenCalledOnce());
  });
});

describe("ReceiptScanner receipt parsing", () => {
  it("does not import subtotal, total, payment, tax, or change as purchased items", () => {
    const items = parseReceiptText([
      "おにぎり ¥500",
      "緑茶 ¥270",
      "小計 ¥770",
      "消費税10% ¥70",
      "合計 ¥770",
      "現金 ¥1000",
      "お釣り ¥230",
    ].join("\n"));

    expect(items).toEqual([
      { name: "おにぎり", amount: 500, category: "food" },
      { name: "緑茶", amount: 270, category: "food" },
    ]);
  });

  it("keeps product names that merely start with a summary keyword", () => {
    expect(parseReceiptText("カードケース ¥1200")).toEqual([
      { name: "カードケース", amount: 1200, category: "other" },
    ]);
  });
});
