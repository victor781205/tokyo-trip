import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EmergencyContacts } from "@/components/EmergencyContacts";

describe("EmergencyContacts", () => {
  it("shows the current Taiwan mission emergency contacts and JNTO hotline", () => {
    render(<EmergencyContacts />);

    expect(screen.getByText("03-3280-7811")).toBeInTheDocument();
    expect(screen.getByText("080-1009-7179")).toBeInTheDocument();
    expect(screen.getByText(/備援 080-1009-7436/)).toBeInTheDocument();
    expect(screen.getByText("050-3816-2787")).toBeInTheDocument();
    expect(screen.queryByText("03-3592-1266")).not.toBeInTheDocument();
  });

  it("keeps the nearest multilingual hospital contact visible", () => {
    render(<EmergencyContacts />);

    expect(screen.getByText("東京都立墨東病院")).toBeInTheDocument();
    expect(screen.getByText("+81-3-3633-6151")).toBeInTheDocument();
    expect(screen.getByText(/英／中醫療口譯僅平日 09:00–17:00，急診口譯不保證/)).toBeInTheDocument();
    expect(screen.getByText(/急診 24h；到院前先電話/)).toBeInTheDocument();
  });

  it("qualifies 119 interpretation availability and shows the official night contact", () => {
    render(<EmergencyContacts />);

    expect(screen.getByText(/部分地區 119 已導入多語三方口譯.*依所在地與當下服務為準/)).toBeInTheDocument();
    expect(screen.getByText("駐日代表處夜間警衛")).toBeInTheDocument();
    expect(screen.getByText("03-3280-7917")).toBeInTheDocument();
    expect(screen.getByText("辦公時間外的緊急救助聯絡")).toBeInTheDocument();
    expect(screen.queryByText("桃園機場航班語音查詢")).not.toBeInTheDocument();
  });

  it("puts 110 and 119 in the first-screen quick actions", () => {
    render(<EmergencyContacts />);

    expect(screen.getByRole("button", { name: "立即撥打 日本報警：110" })).toHaveTextContent("110");
    expect(screen.getByRole("button", { name: "立即撥打 救護車・消防：119" })).toHaveTextContent("119");
    expect(screen.getByText("重要提醒與口譯資訊").closest("details")).not.toHaveAttribute("open");
  });

  it("opens an accessible full-screen Japanese help card", () => {
    render(<EmergencyContacts />);

    fireEvent.click(screen.getByRole("button", { name: "給日本人看" }));
    const dialog = screen.getByRole("dialog", { name: "この画面を見せてください" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(dialog).toHaveTextContent("救急車を呼んでください");

    fireEvent.click(screen.getByRole("button", { name: "請叫警察" }));
    expect(dialog).toHaveTextContent("警察を呼んでください");
    fireEvent.click(screen.getByRole("button", { name: "關閉日文求助卡" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("keeps the Japanese help card scrollable inside a 320x568 or landscape viewport", () => {
    render(<EmergencyContacts />);

    fireEvent.click(screen.getByRole("button", { name: "給日本人看" }));
    const dialog = screen.getByRole("dialog", { name: "この画面を見せてください" });
    const backdrop = dialog.parentElement;

    expect(dialog).toHaveClass(
      "h-[calc(100dvh-1.5rem-var(--sat)-var(--sab))]",
      "md:h-[calc(100dvh-4rem-var(--sat)-var(--sab))]",
      "max-h-[680px]",
      "min-h-0",
      "overflow-y-auto",
      "overscroll-contain",
    );
    expect(backdrop).toHaveClass(
      "pt-[calc(0.75rem+var(--sat))]",
      "pb-[calc(0.75rem+var(--sab))]",
      "md:pt-[calc(2rem+var(--sat))]",
      "md:pb-[calc(2rem+var(--sab))]",
    );
    expect(within(dialog).getByRole("button", { name: "播放日文" })).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "請叫警察" })).toBeInTheDocument();
  });

  it("shows a copyable Japanese hotel address and navigation", () => {
    render(<EmergencyContacts />);

    expect(screen.getByText("東武ホテルレバント東京")).toBeInTheDocument();
    expect(screen.getByText("〒130-0013 東京都墨田区錦糸1-2-2")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "開啟導航" })).toHaveAttribute("target", "_blank");
  });
});
