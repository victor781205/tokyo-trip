import { describe, expect, it } from "vitest";
import { getAircraftInfo, getScheduledAircraft } from "@/lib/aircraft-info";

describe("scheduled aircraft", () => {
  it("keeps the two booked flights on their actual aircraft variants", () => {
    expect(getScheduledAircraft("JX800")).toMatchObject({
      icao: "A35K",
      modelZh: "Airbus A350-1000",
    });
    expect(getScheduledAircraft("JX805")).toMatchObject({
      icao: "A339",
      modelZh: "Airbus A330-900neo",
    });
  });

  it("uses STARLUX's 350-seat A350-1000 layout", () => {
    expect(getAircraftInfo("A35K")?.tags).toContain("寬體 350 席");
    expect(getAircraftInfo("A35K")?.tags).not.toContain("寬體 425 席");
  });
});
