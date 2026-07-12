import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";
import { flightInfoQuerySchema } from "@/lib/validations";
import { resolveAircraft } from "@/lib/aircraft-info";
import { getStationInfo } from "@/lib/airline-stations";
import {
  TRIP_INBOUND_DATE,
  TRIP_OUTBOUND_DATE,
  shouldFetchLiveFlight,
} from "@/lib/trip-dates";
import {
  type ExternalFlight,
  findTdxFlightForDate,
  getAviationStackDepartureSourceDate,
  getTdxArrivalSourceDate,
  getTdxDepartureSourceDate,
  matchesAviationStackFlight,
  normalizeFlightStatus,
} from "@/lib/flight-data";

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

export async function GET(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "anonymous";
  const { allowed, remaining, retryAfter } = checkRateLimit(`flight:${ip}`, 20, 60_000);

  const parsed = flightInfoQuerySchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query", issues: parsed.error.flatten() },
      { status: 400, headers: { "X-RateLimit-Remaining": String(remaining) } }
    );
  }
  const requestedFlight = parsed.data.flight?.trim() || "JX800";
  const requestedDate = parsed.data.date ?? TRIP_OUTBOUND_DATE;
  const requestedInboundDate = parsed.data.inboundDate ?? TRIP_INBOUND_DATE;
  const outboundLiveWindow = shouldFetchLiveFlight(requestedDate, new Date(), "Asia/Taipei");
  const inboundLiveWindow = shouldFetchLiveFlight(requestedInboundDate, new Date(), "Asia/Tokyo");
  const requestedNumber = requestedFlight.replace(/^[A-Za-z]+/, "");
  const requestedIcao = requestedFlight.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "JX";

  // 回程航班號碼規則：JX800 ⇄ JX801、JX804 ⇄ JX805、…
  // 此專案目前 hardcode JX800 去程配 JX805 回程（航空規劃已確認）
  const inboundFlight = (() => {
    const icao = requestedFlight.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "JX";
    const num = parseInt(requestedNumber, 10);
    if (!Number.isNaN(num)) {
      // JX800 -> JX805；JX805 -> JX800
      const inboundNum = num === 800 ? 805 : num === 805 ? 800 : num + 1;
      return `${icao}${inboundNum}`;
    }
    return `${icao}805`;
  })();

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfter },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
        },
      }
    );
  }

  // ── 去程 JX800（TPE 出發）— 使用 TDX 機場 FIDS ──
  let outbound: Record<string, unknown> | null = null;
  if (outboundLiveWindow) try {
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
      const flight = findTdxFlightForDate(
        data,
        ["SJX", requestedIcao],
        requestedNumber,
        requestedDate,
      );

      if (flight) {
        const sourceDate = getTdxDepartureSourceDate(flight);
        if (!sourceDate) throw new Error("TDX departure source date was not validated");
        const aircraft = resolveAircraft(
          String(flight.AcType || flight.AircraftType || ""),
          requestedFlight
        );
        outbound = {
          gate: String(flight.Gate || "尚未公佈").trim(),
          status: normalizeFlightStatus(
            flight.DepartureRemark || flight.DepartureRemarkEn
          ),
          terminal: String(flight.Terminal || "1"),
          time: String(
            flight.ScheduleDepartureTime || flight.ScheduleArrivalTime || ""
          ),
          actualTime: String(
            flight.ActualDepartureTime || flight.ActualArrivalTime || ""
          ),
          aircraftIcao: aircraft?.icao ?? "",
          aircraftModel: aircraft?.modelZh ?? "",
          aircraftTags: aircraft?.tags ?? [],
          aircraftLive: Boolean(aircraft?.live),
          isLive: true,
          source: "TDX-Departure",
          sourceDate,
        };
      }
    }
  } catch (error) {
    console.error("TDX Flight API Error:", error);
  }

  // ── 回程 JX805（NRT 出發 → TPE 抵達）— 並行查詢兩端即時資料 + 合成 ──
  // 來源 A：TDX FIDS Arrival/TPE → 提供 TPE 抵達端航廈/登機門/時間 + AcType 機型
  // 來源 B：AviationStack NRT Departure → 提供 NRT 出發端航廈/登機門/時間/狀態
  // fallback：getStationInfo hardcode 補 NRT/TPE 預設航廈（如 NRT 第 2 航廈）
  // 機型優先序：TDX AcType → hardcode 預定機型
  let inbound: Record<string, unknown> | null = null;
  const inboundNumber = inboundFlight.replace(/^[A-Za-z]+/, "");
  const inboundIcao =
    inboundFlight.match(/^[A-Za-z]+/)?.[0]?.toUpperCase() ?? "JX";
  const nrtStation = getStationInfo(inboundIcao, "NRT");
  const tpeStation = getStationInfo(inboundIcao, "TPE");

  // 暫存 TPE 抵達資料（TDX Arrival）
  let tdxArr: {
    sourceDate: string;
    gate: string;
    terminal: string;
    scheduled: string;
    estimated: string;
    actual: string;
    status: string;
    aircraftIcao: string;
    aircraftModel: string;
    aircraftTags: string[];
    aircraftLive: boolean;
  } | null = null;

  // 暫存 NRT 出發資料（AviationStack）
  let avstDep: {
    sourceDate: string;
    gate: string;
    terminal: string;
    scheduled: string;
    estimated: string;
    actual: string;
    delay: string;
    status: string;
  } | null = null;

  // ── 來源 A：TDX FIDS Arrival/TPE（TPE 抵達端 + 機型）──
  if (inboundLiveWindow) try {
    const tdxToken = await getTdxToken();
    const arrHeaders: Record<string, string> = {
      "User-Agent": "Mozilla/5.0",
      Accept: "application/json",
    };
    if (tdxToken) {
      arrHeaders["Authorization"] = `Bearer ${tdxToken}`;
    }

    const arrRes = await fetch(
      "https://tdx.transportdata.tw/api/basic/v2/Air/FIDS/Airport/Arrival/TPE?%24format=JSON",
      { headers: arrHeaders, next: { revalidate: 300 } }
    );

    if (arrRes.ok) {
      const arrData = await arrRes.json();
      const flight = findTdxFlightForDate(
        arrData,
        ["SJX", inboundIcao],
        inboundNumber,
        requestedInboundDate,
      );

      if (flight) {
        const sourceDate = getTdxArrivalSourceDate(flight);
        if (!sourceDate) throw new Error("TDX arrival source date was not validated");
        const aircraft = resolveAircraft(
          String(flight.AcType || flight.AircraftType || ""),
          inboundFlight
        );
        tdxArr = {
          sourceDate,
          gate: String(flight.Gate || "").trim() || "尚未公佈",
          terminal: String(flight.Terminal || "").trim() || tpeStation?.defaultTerminal || "1",
          scheduled: String(
            flight.ScheduleArrivalTime || flight.ScheduleDepartureTime || ""
          ),
          estimated: String(
            flight.EstimatedArrivalTime || flight.EstimatedDepartureTime || ""
          ),
          actual: String(
            flight.ActualArrivalTime || flight.ActualDepartureTime || ""
          ),
          status: normalizeFlightStatus(
            flight.ArrivalRemark || flight.ArrivalRemarkEn
          ),
          aircraftIcao: aircraft?.icao ?? "",
          aircraftModel: aircraft?.modelZh ?? "",
          aircraftTags: aircraft?.tags ?? [],
          aircraftLive: Boolean(aircraft?.live),
        };
      }
    }
  } catch (error) {
    console.error("TDX Arrival API Error:", error);
  }

  // ── 來源 B：AviationStack NRT Departure（NRT 出發端）──
  if (inboundLiveWindow && AVIATION_STACK_KEY) {
    try {
      const params = new URLSearchParams({
        access_key: AVIATION_STACK_KEY,
        dep_iata: "NRT",
        flight_number: inboundNumber,
        flight_date: requestedInboundDate,
      });
      const res = await fetch(
        `https://api.aviationstack.com/v1/flights?${params.toString()}`,
        { next: { revalidate: 300 } },
      );

      if (res.ok) {
        const json = await res.json();
        const flights: ExternalFlight[] = Array.isArray(json?.data) ? json.data : [];
        const flight = flights.find((candidate) =>
          matchesAviationStackFlight(
            candidate,
            inboundFlight,
            requestedInboundDate,
          ),
        );
        if (flight) {
          const sourceDate = getAviationStackDepartureSourceDate(flight);
          if (!sourceDate) throw new Error("AviationStack source date was not validated");
          const departure = flight.departure as ExternalFlight;
          avstDep = {
            sourceDate,
            gate: String(departure.gate || "").trim() || "尚未公佈",
            terminal:
              String(departure.terminal || "").trim() ||
              nrtStation?.defaultTerminal ||
              "未公佈",
            scheduled: String(departure.scheduled || ""),
            estimated: String(departure.estimated || ""),
            actual: String(departure.actual || ""),
            delay: String(departure.delay ?? ""),
            status: normalizeFlightStatus(flight.flight_status),
          };
        }
      }
    } catch (error) {
      console.error("AviationStack API Error:", error);
    }
  }

  // ── 合成 inbound 物件（雙端資料）──
  // 機型來源：TDX Arrival > hardcode 預定機型
  const aircraft =
    tdxArr?.aircraftIcao || tdxArr?.aircraftModel
      ? {
        aircraftIcao: tdxArr!.aircraftIcao,
        aircraftModel: tdxArr!.aircraftModel,
        aircraftTags: tdxArr!.aircraftTags,
        aircraftLive: tdxArr!.aircraftLive,
      }
      : (() => {
        const a = resolveAircraft(null, inboundFlight);
        return {
          aircraftIcao: a?.icao ?? "",
          aircraftModel: a?.modelZh ?? "",
          aircraftTags: a?.tags ?? [],
          aircraftLive: false,
        };
      })();

  inbound = {
    // 出發端（NRT）
    depGate: avstDep?.gate ?? "尚未公佈",
    depTerminal: avstDep?.terminal ?? nrtStation?.defaultTerminal ?? "未公佈",
    depScheduled: avstDep?.scheduled ?? "",
    depEstimated: avstDep?.estimated ?? "",
    depActual: avstDep?.actual ?? "",
    depDelay: avstDep?.delay ?? "",
    depStatus: avstDep?.status ?? "unknown",
    // 抵達端（TPE）
    arrGate: tdxArr?.gate ?? "尚未公佈",
    arrTerminal: tdxArr?.terminal ?? tpeStation?.defaultTerminal ?? "1",
    arrScheduled: tdxArr?.scheduled ?? "",
    arrEstimated: tdxArr?.estimated ?? "",
    arrActual: tdxArr?.actual ?? "",
    arrStatus: tdxArr?.status ?? "unknown",
    // 機型
    aircraftIcao: aircraft.aircraftIcao,
    aircraftModel: aircraft.aircraftModel,
    aircraftTags: aircraft.aircraftTags,
    aircraftLive: aircraft.aircraftLive,
    aircraftSource: tdxArr ? "TDX-Arrival" : "hardcode-scheduled",
    // 來源標記
    depSource: avstDep ? "AviationStack" : (
      nrtStation?.isStarluxTerminal ? "hardcode-Starlux" : "未抓到"
    ),
    arrSource: tdxArr ? "TDX-Arrival" : (
      tpeStation?.isStarluxTerminal ? "hardcode-Starlux" : "未抓到"
    ),
    isLive: Boolean(inboundLiveWindow && (avstDep || tdxArr)),
    // 不提供 composite sourceDate，避免單一正確來源替另一個錯日來源背書。
    sourceDate: null,
    depSourceDate: avstDep?.sourceDate ?? null,
    arrSourceDate: tdxArr?.sourceDate ?? null,
  };

  // 若去程 TDX 找不到（航班尚未在 FIDS 中），仍回傳 hardcode 預定機型給前端顯示
  if (!outbound) {
    const a = resolveAircraft(null, requestedFlight);
    // （inbound 用 inboundFlight 而非 requestedFlight，hardcode 對應 JX805）
    outbound = {
      gate: "尚未公佈",
      status: "預定",
      terminal: "1",
      time: "",
      actualTime: "",
      aircraftIcao: a?.icao ?? "",
      aircraftModel: a?.modelZh ?? "",
      aircraftTags: a?.tags ?? [],
      aircraftLive: false,
      isLive: false,
      source: "hardcode-itinerary",
      sourceDate: null,
    };
  }


  return NextResponse.json(
    {
      flight: requestedFlight,
      requestedDates: {
        outbound: requestedDate,
        inbound: requestedInboundDate,
      },
      liveWindow: {
        outbound: outboundLiveWindow,
        inbound: inboundLiveWindow,
      },
      outbound,
      inbound,
    },
    { headers: { "X-RateLimit-Remaining": String(remaining) } }
  );
}
