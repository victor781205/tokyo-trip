import type { BudgetItem } from "@/context/TripContext";
import {
  getDateInTimeZone,
  TRIP_OUTBOUND_DATE,
  TRIP_TOTAL_DAYS,
} from "@/lib/trip-dates";

export const MAX_YEN_AMOUNT = 999_999_999;
export const TRIP_TRAVELERS = ["Victor", "毓寧"] as const;
export const DEFAULT_BUDGET_PAYER = TRIP_TRAVELERS[0];

export const BUDGET_CATEGORY_KEYS = [
  "food",
  "transport",
  "shopping",
  "ticket",
  "hotel",
  "other",
] as const;

export type BudgetCategoryKey = (typeof BUDGET_CATEGORY_KEYS)[number];
export type TripTraveler = (typeof TRIP_TRAVELERS)[number];

export type CreateBudgetItemInput = {
  id?: number;
  name: string;
  amount: unknown;
  category: string;
  date: string;
  payer?: string;
  participants?: readonly string[];
};

export function normalizeYenAmount(value: unknown): number | null {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 1 || numeric > MAX_YEN_AMOUNT) return null;
  const rounded = Math.round(numeric);
  return Number.isSafeInteger(rounded) && rounded >= 1 ? rounded : null;
}

export function normalizeBudgetCategory(value: string): BudgetCategoryKey {
  return BUDGET_CATEGORY_KEYS.includes(value as BudgetCategoryKey)
    ? value as BudgetCategoryKey
    : "other";
}

/**
 * Accept legacy slash/dot dates but always persist a calendar date in the
 * Tokyo-facing YYYY-MM-DD format used by the date input and day badges.
 */
export function normalizeBudgetDate(value: string): string | null {
  const match = value.trim().match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) return null;
  return [year, month, day]
    .map((part, index) => part.toString().padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

export function getTokyoBudgetDate(now = new Date()): string {
  return getDateInTimeZone(now, "Asia/Tokyo");
}

export function getBudgetTripDayLabel(value: string): string | null {
  const date = normalizeBudgetDate(value);
  if (!date || date < TRIP_OUTBOUND_DATE) return null;
  const first = Date.parse(`${TRIP_OUTBOUND_DATE}T12:00:00Z`);
  const current = Date.parse(`${date}T12:00:00Z`);
  const day = Math.floor((current - first) / 86_400_000) + 1;
  return day >= 1 && day <= TRIP_TOTAL_DAYS ? `Day ${day}` : null;
}

export function getBudgetDateForTripDay(day: number): string | null {
  if (!Number.isInteger(day) || day < 1 || day > TRIP_TOTAL_DAYS) return null;
  const date = new Date(`${TRIP_OUTBOUND_DATE}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString().slice(0, 10);
}

function isTripTraveler(value: string): value is TripTraveler {
  return TRIP_TRAVELERS.includes(value as TripTraveler);
}

function normalizeParticipants(values?: readonly string[]): TripTraveler[] {
  return (values ?? TRIP_TRAVELERS)
    .filter(isTripTraveler)
    .filter((value, index, all) => all.indexOf(value) === index);
}

/** Build the canonical item shape shared by manual, OCR, and itinerary entry. */
export function createBudgetItem(input: CreateBudgetItemInput): BudgetItem | null {
  const name = input.name.trim();
  const amount = normalizeYenAmount(input.amount);
  const date = normalizeBudgetDate(input.date);
  if (!name || amount === null || date === null) return null;

  const payer = input.payer ?? DEFAULT_BUDGET_PAYER;
  const participants = normalizeParticipants(input.participants);
  if (!isTripTraveler(payer) || participants.length === 0) return null;

  return {
    id: input.id ?? Date.now(),
    name,
    amount,
    category: normalizeBudgetCategory(input.category),
    date,
    payer,
    participants,
  };
}
