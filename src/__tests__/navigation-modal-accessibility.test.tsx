import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Navigation } from "@/components/Navigation";

const mocks = vi.hoisted(() => ({
  setTheme: vi.fn(),
  alert: vi.fn(async () => undefined),
  confirm: vi.fn(async () => true),
}));

vi.mock("@/components/ThemeProvider", () => ({
  useTheme: () => ({
    theme: "light",
    systemTheme: "light",
    resolvedTheme: "light",
    setTheme: mocks.setTheme,
  }),
}));

vi.mock("@/context/DialogContext", () => ({
  useDialog: () => ({ alert: mocks.alert, confirm: mocks.confirm }),
}));

vi.mock("@/context/TripContext", () => ({
  useTrip: () => ({
    tripId: "trip_test",
    tripSecret: "secret_test",
    loginToTrip: vi.fn(async () => true),
    getShareLink: vi.fn(() => "https://example.test/#trip=trip_test&secret=secret_test"),
    rotateTripSecret: vi.fn(async () => ({ ok: true, newSecret: "next_secret" })),
    syncStatus: "online",
    saveStatus: "synced",
    syncError: null,
    pendingSliceCount: 0,
    lastSyncedAt: Date.now(),
    storageError: null,
    isShareReady: true,
    retrySync: vi.fn(async () => true),
    flushSync: vi.fn(async () => true),
    exportBackup: vi.fn(),
    recentTrips: [],
    switchTrip: vi.fn(async () => true),
    versionHistory: [],
    restoreRevision: vi.fn(() => true),
    hasRevisionRollback: false,
    applyAuthoritativeRollback: vi.fn(() => true),
  }),
}));

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

describe("Navigation mobile modal accessibility", () => {
  it("restores the main navigation after closing and can open the menu again", () => {
    render(<Navigation activeTab="hero" setActiveTab={vi.fn()} />);

    const mainNavigation = screen.getByRole("navigation", { name: "主要導覽" });
    fireEvent.click(screen.getByRole("button", { name: "開啟分類選單" }));

    expect(screen.getByRole("dialog", { name: "分類選單" })).toBeInTheDocument();
    expect(mainNavigation).toHaveAttribute("aria-hidden", "true");
    expect(mainNavigation).toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "關閉分類選單" }));

    expect(screen.queryByRole("dialog", { name: "分類選單" })).not.toBeInTheDocument();
    expect(mainNavigation).not.toHaveAttribute("aria-hidden");
    expect(mainNavigation).not.toHaveAttribute("inert");

    fireEvent.click(screen.getByRole("button", { name: "開啟分類選單" }));
    expect(screen.getByRole("dialog", { name: "分類選單" })).toBeInTheDocument();
  });
});
