import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HotelInfo } from "@/components/HotelInfo";

afterEach(cleanup);

describe("HotelInfo airport transfers", () => {
  it("makes the hotel-departure bus reservation requirement explicit", () => {
    render(<HotelInfo />);

    expect(screen.getByText(/飯店出發班次為預約制/)).toHaveTextContent(
      /事前自行網路預約.*飯店前台不受理代訂/,
    );
    expect(screen.getByText(/入住前可寄放；退房後請先向飯店確認/)).toBeInTheDocument();
    expect(screen.getByText("約 ¥2,700")).toBeInTheDocument();
    expect(screen.queryByText(/¥2,800\+/)).not.toBeInTheDocument();
  });

  it("links every transfer card to its matching official route", () => {
    render(<HotelInfo />);

    expect(screen.getByRole("link", { name: "利木津巴士：官方時刻與預約" })).toHaveAttribute(
      "href",
      expect.stringContaining("webservice.limousinebus.co.jp"),
    );
    expect(screen.getByRole("link", { name: "JR 總武線直達：JR 官方路線圖" })).toHaveAttribute(
      "href",
      "https://www.jreast.co.jp/chiba/pdf/soubu.pdf",
    );
    expect(screen.getByRole("link", { name: "京成 Access 特快：京成官方路線" })).toHaveAttribute(
      "href",
      expect.stringContaining("/directions/oshiage.php"),
    );
    expect(screen.getByRole("link", { name: "Skyliner + JR 線：Skyliner 官方資訊" })).toHaveAttribute(
      "href",
      expect.stringContaining("/skyliner/us/index.php"),
    );
    expect(screen.getByRole("link", { name: "JR 東日本官方購買說明" })).toHaveAttribute(
      "href",
      "https://www.jreast.co.jp/multi/welcomesuica/purchase.html",
    );
    expect(screen.getByRole("note")).toHaveTextContent(/Welcome Suica.*購買日起 28 天有效.*免押金.*餘額不退/);
  });
});
