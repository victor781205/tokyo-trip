import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import manifest from "../../public/manifest.json";
import { viewport } from "@/app/layout";

vi.mock("next/font/google", () => ({
  Noto_Sans_TC: () => ({ variable: "font-sans-test" }),
  Noto_Serif_TC: () => ({ variable: "font-serif-test" }),
}));

function relativeLuminance(hex: string) {
  const channels = hex
    .slice(1)
    .match(/.{2}/g)!
    .map((channel) => Number.parseInt(channel, 16) / 255)
    .map((channel) =>
      channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4,
    );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(first: string, second: string) {
  const [lighter, darker] = [relativeLuminance(first), relativeLuminance(second)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function blendHex(foreground: string, background: string, alpha: number) {
  const channel = (hex: string, offset: number) => Number.parseInt(hex.slice(offset, offset + 2), 16);
  return `#${[1, 3, 5]
    .map((offset) => Math.round(
      channel(foreground, offset) * alpha + channel(background, offset) * (1 - alpha),
    ).toString(16).padStart(2, "0"))
    .join("")}`;
}

describe("app shell accessibility", () => {
  it("allows browser zoom and does not lock the installed app to portrait", () => {
    expect(viewport.maximumScale).toBeUndefined();
    expect(viewport.userScalable).not.toBe(false);
    expect(manifest).not.toHaveProperty("orientation");
  });

  it("keeps brand text colors at WCAG AA contrast in both themes", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const color = (pattern: RegExp) => css.match(pattern)?.[1].toLowerCase();
    const primary = color(/--color-primary:\s*(#[0-9a-f]{6})/i);
    const accent = color(/--color-accent:\s*(#[0-9a-f]{6})/i);
    const darkPrimary = color(/\.dark \.text-primary\s*\{\s*color:\s*(#[0-9a-f]{6})/i);
    const darkAccent = color(/\.dark \.text-accent\s*\{\s*color:\s*(#[0-9a-f]{6})/i);

    expect(primary).toBeDefined();
    expect(accent).toBeDefined();
    expect(darkPrimary).toBeDefined();
    expect(darkAccent).toBeDefined();
    expect(contrastRatio(primary!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(primary!, blendHex(primary!, "#ffffff", 0.1)))
      .toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accent!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkPrimary!, "#1e293b")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkAccent!, "#1e293b")).toBeGreaterThanOrEqual(4.5);
  });

  it("uses one WCAG AA secondary-text token and a global keyboard focus fallback", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const muted = css.match(/--foreground-muted:\s*(#[0-9a-f]{6})/i)?.[1];
    const darkMuted = css.match(/\.dark\s*\{[\s\S]*?--foreground-muted:\s*(#[0-9a-f]{6})/i)?.[1];

    expect(muted).toBeDefined();
    expect(darkMuted).toBeDefined();
    expect(contrastRatio(muted!, "#ffffff")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(darkMuted!, "#1e293b")).toBeGreaterThanOrEqual(4.5);
    for (const token of ["danger", "success", "warning", "info"]) {
      const light = css.match(new RegExp(`--foreground-${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
      const dark = css.match(new RegExp(`\\.dark\\s*\\{[\\s\\S]*?--foreground-${token}:\\s*(#[0-9a-f]{6})`, "i"))?.[1];
      expect(light, `${token} light token`).toBeDefined();
      expect(dark, `${token} dark token`).toBeDefined();
      expect(contrastRatio(light!, "#ffffff"), `${token} on white`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(dark!, "#1e293b"), `${token} on slate`).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toMatch(/\.text-gray-400,[\s\S]*?\.text-gray-500\s*\{[\s\S]*?var\(--foreground-muted\)/);
    expect(css).toMatch(/:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible:not/);
    expect(css).toContain("prefers-reduced-motion: reduce");
  });

  it("stacks the sync toast and travel dock through the full mobile-navigation range", () => {
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

    expect(css).toMatch(/@media \(max-width: 1023px\)[\s\S]*?body:has\(\[data-sync-indicator\]\) \.travel-mode-dock/);
    expect(css).toMatch(/\.travel-mode-dock\s*\{[\s\S]*?bottom:\s*calc\(10\.75rem \+ var\(--sab\)\)/);
  });

  it("announces the action the theme toggle will actually perform", () => {
    const source = readFileSync(join(process.cwd(), "src/components/Navigation.tsx"), "utf8");

    expect(source.match(/aria-label=\{themeToggleLabel\}/g)).toHaveLength(2);
    expect(source).toContain('isDarkTheme ? "切換淺色模式" : "切換深色模式"');
    expect(source).not.toContain('aria-label="切換深色模式"');
  });
});
