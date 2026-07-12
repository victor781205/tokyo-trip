"use client";

import { useTrip } from "@/context/TripContext";

export type { Activity, DayPlan, Itinerary, BudgetItem, CustomFood, SyncStatus, PackingItem } from "@/context/TripContext";

export function useTripState() {
  const {
    isLoaded,
    syncStatus,
    tripId,
    itinerary, setItinerary,
    budgetItems, setBudgetItems,
    budgetLimit, setBudgetLimit,
    customFoods, setCustomFoods,
    packingList, setPackingList
  } = useTrip();

  return {
    isLoaded,
    syncStatus,
    tripId,
    itinerary,
    updateItinerary: setItinerary,
    budgetItems,
    updateBudgetItems: setBudgetItems,
    budgetLimit,
    setBudgetLimit,
    customFoods,
    updateCustomFoods: setCustomFoods,
    packingList,
    updatePackingList: setPackingList
  };
}
