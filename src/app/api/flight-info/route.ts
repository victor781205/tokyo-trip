import { NextResponse } from "next/server";

const AVIATION_STACK_KEY = process.env.AVIATION_STACK_KEY?.trim() ?? "";
const TDX_CLIENT_ID = process.env.TDX_CLIENT_ID?.trim() ?? "";
const TDX_CLIENT_SECRET = process.env.TDX_CLIENT_SECRET?.trim() ?? "";

async function getTdxToken(): Promise<string | null> {
  if (!TDX_CLIENT_ID || !TDX_CLIENT_SECRET) return null;
  try {
    const res = await fetch(
      "https://tdx.transportdata.tw/auth/realms/TDXConnect/protocol/openid-connect/token",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `grant_type=client_credentials&client_id=${TDX_CLIENT_ID}&client_secret=${TDX_CLIENT_SECRET}`,
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export async function GET() {
  // ── 去程 JX800（TPE 出發）— 使用 TDX 機場 FIDS ──
  let outbound: Record<string, string> | null = null;
  try {
    const tdxToken = await getTdxToken();
    const headers: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    };
    if (tdxToken) {
      headers["Authorization"] = `Bearer ${tdxToken}`;
    }

    const res = await fetch(
      "https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Departure/TPE?%24format=JSON",
      { headers, next: { revalidate: 300 } }
    );

    if (res.ok) {
      const data = await res.json();
      const flight = data.find(
        (f: Record<string, string | number>) =>
          (f.AirlineID === "SJX" || f.AirlineID === "JX") &&
          f.FlightNumber === "800"
      );

      if (flight) {
        outbound = {
          gate: String(flight.Gate || "尚未公佈").trim(),
          status: String(
            flight.ArrivalStatus || flight.DepartureStatus || "準時"
          ),
          terminal: String(flight.Terminal || "1"),
          time: String(
            flight.ScheduleDepartureTime || flight.ScheduleArrivalTime || ""
          ),
          actualTime: String(
            flight.ActualDepartureTime || flight.ActualArrivalTime || ""
          ),
        };
      }
    }
  } catch (error) {
    console.error("TDX Flight API Error:", error);
  }

  // ── 回程 JX805（NRT 出發）— 使用 AviationStack ──
  let inbound: Record<string, string> | null = null;
  if (AVIATION_STACK_KEY) {
    try {
      const url =
        `http://api.aviationstack.com/v1/flights` +
        `?access_key=${AVIATION_STACK_KEY}&dep_iata=NRT&flight_number=JX805`;
      const res = await fetch(url, { next: { revalidate: 300 } });

      if (res.ok) {
        const json = await res.json();
        const flight = json?.data?.[0];
        if (flight) {
          inbound = {
            gate: String(flight.departure?.gate || "尚未公佈"),
            status: String(flight.flight_status || "未知"),
            terminal: String(flight.departure?.terminal || "—"),
            scheduled: String(
              flight.departure?.scheduled || ""
            ),
            estimated: String(
              flight.departure?.estimated || ""
            ),
            actual: String(flight.departure?.actual || ""),
            delay: String(flight.departure?.delay ?? ""),
          };
        }
      }
    } catch (error) {
      console.error("AviationStack API Error:", error);
    }
  }

  return NextResponse.json({
    outbound: outbound ?? { error: "Flight not found in TDX FIDS" },
    inbound: inbound ?? {
      error: AVIATION_STACK_KEY
        ? "Return flight data not yet available (AviationStack)"
        : "AVIATION_STACK_KEY not configured",
    },
  });
}
