import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptScanner } from "@/components/ReceiptScanner";

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
