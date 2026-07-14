import { render, screen } from "@testing-library/react";
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

  it("qualifies 119 interpretation availability and labels the airport number accurately", () => {
    render(<EmergencyContacts />);

    expect(screen.getByText(/部分地區 119 已導入多語三方口譯.*依所在地與當下服務為準/)).toBeInTheDocument();
    expect(screen.getByText("桃園機場航班語音查詢")).toBeInTheDocument();
    expect(screen.getByText("航班資訊語音專線（非緊急／一般客服）")).toBeInTheDocument();
    expect(screen.queryByText("出發地機場聯繫")).not.toBeInTheDocument();
  });
});
