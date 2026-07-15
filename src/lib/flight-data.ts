import { getIsoDatePart, isFlightSourceForDate } from "@/lib/trip-dates";

export type ExternalFlight = Record<string, unknown>;

function firstSourceDate(...values: unknown[]): string | null {
  for (const value of values) {
    const date = getIsoDatePart(String(value ?? ""));
    if (date) return date;
  }
  return null;
}

export function getTdxDepartureSourceDate(flight: ExternalFlight): string | null {
  return firstSourceDate(flight.FlightDate);
}

export function getTdxArrivalSourceDate(flight: ExternalFlight): string | null {
  return firstSourceDate(flight.FlightDate);
}

export function getAviationStackDepartureSourceDate(flight: ExternalFlight): string | null {
  const departure = flight.departure;
  if (!departure || typeof departure !== "object") return null;
  const fields = departure as ExternalFlight;
  return firstSourceDate(fields.scheduled, fields.actual, fields.estimated);
}

export function normalizeFlightStatus(value: unknown): string {
  const status = String(value ?? "").trim().toLowerCase();
  if (!status) return "unknown";
  if (status.includes("cancel") || status.includes("取消")) return "cancelled";
  if (status.includes("delay") || status.includes("延遲") || status.includes("延誤")) return "delayed";
  if (status.includes("divert") || status.includes("改降")) return "diverted";
  if (status.includes("depart") || status.includes("起飛") || status.includes("離站")) return "departed";
  if (status.includes("arriv") || status.includes("抵達") || status.includes("到達")) return "arrived";
  if (status.includes("landed") || status.includes("降落")) return "landed";
  if (status.includes("active") || status.includes("en-route") || status.includes("飛行中")) return "active";
  if (
    status.includes("on time") ||
    status.includes("on-time") ||
    status.includes("準時") ||
    status.includes("正常")
  ) return "on-time";
  if (status.includes("scheduled") || status.includes("排定")) return "scheduled";
  return "unknown";
}

export function findTdxFlightForDate(
  data: unknown,
  airlineIds: string[],
  flightNumber: string,
  targetDate: string,
): ExternalFlight | null {
  if (!Array.isArray(data)) return null;
  return data.find((flight: ExternalFlight) =>
    airlineIds.includes(String(flight.AirlineID ?? "").toUpperCase()) &&
    String(flight.FlightNumber ?? "").replace(/^0+/, "") === flightNumber.replace(/^0+/, "") &&
    isFlightSourceForDate(flight.FlightDate as string | undefined, targetDate)
  ) ?? null;
}

export function matchesAviationStackFlight(
  candidate: ExternalFlight,
  requestedFlight: string,
  targetDate: string,
): boolean {
  const details = candidate.flight;
  if (!details || typeof details !== "object") return false;
  const flight = details as ExternalFlight;
  const expected = requestedFlight.replace(/\s+/g, "").toUpperCase();
  const expectedNumber = expected.replace(/^[A-Z]+/, "").replace(/^0+/, "");
  const number = String(flight.number ?? "").replace(/^0+/, "");
  const iata = String(flight.iata ?? "").replace(/\s+/g, "").toUpperCase();

  return number === expectedNumber &&
    (!iata || iata === expected) &&
    isFlightSourceForDate(
      getAviationStackDepartureSourceDate(candidate),
      targetDate,
    );
}
