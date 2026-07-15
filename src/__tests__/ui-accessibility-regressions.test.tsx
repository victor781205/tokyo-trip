import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hero } from "@/components/Hero";
import { JapanesePhrases } from "@/components/JapanesePhrases";
import { PushSubscriptionPrompt } from "@/components/PushSubscriptionPrompt";
import { SectionAnchors } from "@/components/SectionAnchors";

const pushMocks = vi.hoisted(() => ({
  permission: "default" as "default" | "granted" | "denied",
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    current: "web",
    permission: pushMocks.permission,
    registered: false,
    register: vi.fn().mockResolvedValue({ endpoint: "test" }),
    unregister: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@/lib/platform", () => ({
  getPushCapabilitySnapshot: () => "test-capability",
  isIOSBrowser: () => false,
  isStandaloneWebApp: () => true,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  pushMocks.permission = "default";
});

describe("UI accessibility regressions", () => {
  it("gives the hero arrow a name that matches its flight navigation action", () => {
    const onNavigate = vi.fn();
    render(<Hero onNavigate={onNavigate} />);

    const button = screen.getByRole("button", { name: "查看航班資訊" });
    fireEvent.click(button);
    expect(onNavigate).toHaveBeenCalledWith("flights");
    expect(button).toHaveClass("focus-visible:ring-2");
  });

  it("keeps Japanese pronunciation controls visible when keyboard-focused", () => {
    render(<JapanesePhrases />);
    const speechButton = screen.getByRole("button", { name: "播放發音：こんにちは" });

    expect(speechButton).toHaveClass("md:focus-visible:opacity-100", "focus-visible:ring-2");
  });

  it("expands matching Japanese phrases and includes the common toilet question", () => {
    render(<JapanesePhrases />);
    fireEvent.change(screen.getByRole("textbox", { name: "搜尋日語短語" }), {
      target: { value: "廁所" },
    });

    expect(screen.getByText("トイレはどこですか？")).toBeVisible();
    expect(screen.getByText(/結果已自動展開/)).toBeInTheDocument();
  });

  it("uses the shared primary color token for the push call to action", () => {
    render(<PushSubscriptionPrompt />);
    const button = screen.getByRole("button", { name: "開啟行程推播提醒" });

    expect(button).toHaveClass("bg-primary/10", "text-primary", "hover:ring-primary/20");
    expect(button).not.toHaveClass("hover:bg-primary/20");
    expect(button.className).not.toContain("brand");
  });

  it("replaces the unusable push action with browser settings guidance after permission is denied", () => {
    pushMocks.permission = "denied";
    render(<PushSubscriptionPrompt />);

    expect(screen.queryByRole("button", { name: "開啟行程推播提醒" })).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("推播權限已被封鎖");
    expect(screen.getByRole("note")).toHaveTextContent(/網址列左側.*網站設定.*通知.*允許/);
  });

  it("keeps long-page anchors sticky, marks the current section, and offers return to top", async () => {
    vi.stubGlobal("IntersectionObserver", class {
      observe() {}
      disconnect() {}
      unobserve() {}
      takeRecords() { return []; }
    });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 600 });
    const originalScrollTo = window.scrollTo;
    const scrollTo = vi.fn();
    Object.defineProperty(window, "scrollTo", { configurable: true, value: scrollTo });

    render(
      <>
        <SectionAnchors items={[
          { id: "weather-test", label: "天氣" },
          { id: "packing-test", label: "行李" },
        ]} />
        <section id="weather-test">天氣內容</section>
        <section id="packing-test">行李內容</section>
      </>,
    );

    const anchorNav = screen.getByRole("navigation", { name: "本頁區塊" });
    expect(anchorNav).toHaveClass("sticky", "backdrop-blur-xl");
    await waitFor(() => expect(screen.getByRole("button", { name: "天氣" })).toHaveAttribute("aria-current", "location"));

    fireEvent.click(screen.getByRole("button", { name: "返回本頁頂部" }));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "smooth" });

    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
    Object.defineProperty(window, "scrollTo", { configurable: true, value: originalScrollTo });
  });
});
