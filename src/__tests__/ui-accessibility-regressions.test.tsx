import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Hero } from "@/components/Hero";
import { JapanesePhrases } from "@/components/JapanesePhrases";
import { PushSubscriptionPrompt } from "@/components/PushSubscriptionPrompt";

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({
    current: "web",
    permission: "default",
    registered: false,
    register: vi.fn().mockResolvedValue({ endpoint: "test" }),
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

  it("uses the shared primary color token for the push call to action", () => {
    render(<PushSubscriptionPrompt />);
    const button = screen.getByRole("button", { name: "開啟行程推播提醒" });

    expect(button).toHaveClass("bg-primary/10", "text-primary", "hover:ring-primary/20");
    expect(button).not.toHaveClass("hover:bg-primary/20");
    expect(button.className).not.toContain("brand");
  });
});
