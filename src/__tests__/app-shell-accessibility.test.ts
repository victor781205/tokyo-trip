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
});
