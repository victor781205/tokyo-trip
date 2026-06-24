import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch("https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Departure/TPE?%24format=JSON", {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
      next: { revalidate: 300 } 
    });

    if (!res.ok) throw new Error("TDX API response not ok");
    
    const data = await res.json();
    
    const flight = data.find((f: Record<string, string | number>) => 
        (f.AirlineID === "SJX" || f.AirlineID === "JX") && f.FlightNumber === "800"
    );

    if (!flight) {
        return NextResponse.json({ error: "Flight not found in current FIDS" });
    }

    return NextResponse.json({
        gate: flight.Gate || "尚未公佈",
        status: flight.ArrivalStatus || flight.DepartureStatus || "準時",
        terminal: flight.Terminal || "1",
        time: flight.ScheduleDepartureTime || flight.ScheduleArrivalTime,
        actualTime: flight.ActualDepartureTime || flight.ActualArrivalTime
    });
  } catch (error) {
    console.error("Flight API Error:", error);
    return NextResponse.json({ error: "Failed to fetch live flight data" }, { status: 500 });
  }
}
