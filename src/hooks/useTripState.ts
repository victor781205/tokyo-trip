"use client";

import { useTrip } from "@/context/TripContext";

export type { Activity, DayPlan, Itinerary, BudgetItem, CustomFood } from "@/context/TripContext";

export function useTripState() {
  const { 
    isLoaded, 
    itinerary, setItinerary, 
    budgetItems, setBudgetItems, 
    budgetLimit, setBudgetLimit,
    customFoods, setCustomFoods
  } = useTrip();

  return {
    isLoaded,
    itinerary,
    updateItinerary: setItinerary,
    budgetItems,
    updateBudgetItems: setBudgetItems,
    budgetLimit,
    setBudgetLimit,
    customFoods,
    updateCustomFoods: setCustomFoods
  };
}
