import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 39, retryAfter: 0 }),
}));

import { GET } from "@/app/api/map-info/route";

function request(url: string) {
  return new NextRequest(
    "http://localhost/api/map-info?url=" + encodeURIComponent(url),
  );
}

describe("GET /api/map-info", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("decodes safe HTML entities without returning markup as a place name", async () => {
    const html = [
      '<meta property="og:title" content="鮨 &amp; 酒 &#x5E97; - Google Maps">',
      '<meta name="description" content="鮨 &amp; 酒 &#x5E97;, 東京都中央区銀座 1-1, sushi">',
    ].join("");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    })));

    const response = await GET(request("https://maps.app.goo.gl/safe-example"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      name: "鮨 & 酒 店",
      emoji: "🍣",
      location: "銀座",
    });
    expect(JSON.stringify(body)).not.toContain("<meta");
  });

  it("validates every redirect target before fetching it", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, {
      status: 302,
      headers: { Location: "http://127.0.0.1/private" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request("https://maps.app.goo.gl/redirect-example"));

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects a URL beyond the bounded query size before contacting upstream", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await GET(request(
      "https://www.google.com/maps?q=" + "a".repeat(2_100),
    ));

    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns an actionable 422 when Google exposes no usable place name", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      "<title>Google Maps</title>",
      {
        status: 200,
        headers: { "Content-Type": "text/html" },
      },
    )));

    const response = await GET(request("https://maps.app.goo.gl/no-name"));

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Could not extract place name"),
    });
  });
});
