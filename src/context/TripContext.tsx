"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ?? "";

export type Activity = { time: string; name: string; desc: string; tag: string; };
export type DayPlan = { title: string; date: string; activities: Activity[]; };
export type Itinerary = Record<string, DayPlan>;
export type BudgetItem = { id: number; name: string; amount: number; category: string; date: string; };
export type CustomFood = { id: number; emoji: string; name: string; location: string; hours: string; desc: string; mapLink: string; image: string; };

interface TripContextType {
  isLoaded: boolean;
  itinerary: Itinerary;
  budgetItems: BudgetItem[];
  budgetLimit: number;
  customFoods: CustomFood[];
  tripId: string;
  tripSecret: string;
  setItinerary: (itin: Itinerary) => void;
  setBudgetItems: (items: BudgetItem[]) => void;
  setBudgetLimit: (limit: number) => void;
  setCustomFoods: (foods: CustomFood[]) => void;
  loginToTrip: (id: string, secret: string) => Promise<boolean>;
  getShareLink: () => string;
}

const TripContext = createContext<TripContextType | undefined>(undefined);

// Helper to generate tokens outside of render
const generateToken = () => Math.random().toString(36).slice(2, 10);

export function TripProvider({ children }: { children: React.ReactNode }) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [itinerary, _setItinerary] = useState<Itinerary>({});
  const [budgetItems, _setBudgetItems] = useState<BudgetItem[]>([]);
  const [budgetLimit, _setBudgetLimit] = useState(100000);
  const [customFoods, _setCustomFoods] = useState<CustomFood[]>([]);
  
  // Initialize with null to avoid hydration mismatch, then set in effect
  const [tripId, setTripId] = useState<string>("");
  const [tripSecret, setTripSecret] = useState<string>("");

  const supabase = useRef<SupabaseClient | null>(null);
  const skipNextPush = useRef(false);
  const lastUpdateRef = useRef(0);
  const realtimeChannel = useRef<ReturnType<SupabaseClient['channel']> | null>(null);

  const connectToTrip = useCallback(async (id: string, secret: string, client: SupabaseClient) => {
    if (realtimeChannel.current) {
        client.removeChannel(realtimeChannel.current);
    }

    const { data } = await client.from("sync_state").select("*").eq("trip_id", id).eq("trip_secret", secret).maybeSingle();
    
    if (data) {
        skipNextPush.current = true;
        if (data.itinerary) _setItinerary(data.itinerary);
        if (data.budget_limit) _setBudgetLimit(data.budget_limit);
        if (data.budget_items) _setBudgetItems(data.budget_items);
        if (data.custom_foods) _setCustomFoods(data.custom_foods);
        lastUpdateRef.current = data.updated_at ? new Date(data.updated_at).getTime() : 0;
        setTimeout(() => { skipNextPush.current = false; }, 1000);
    }

    const channel = client.channel(`trip:${id}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sync_state', filter: `trip_id=eq.${id}` }, 
      (payload) => {
          const remoteUpdated = payload.new.updated_at ? new Date(payload.new.updated_at).getTime() : 0;
          if (remoteUpdated > lastUpdateRef.current && payload.new.trip_secret === secret) {
              skipNextPush.current = true;
              if (payload.new.itinerary) _setItinerary(payload.new.itinerary);
              if (payload.new.budget_limit) _setBudgetLimit(payload.new.budget_limit);
              if (payload.new.budget_items) _setBudgetItems(payload.new.budget_items);
              if (payload.new.custom_foods) _setCustomFoods(payload.new.custom_foods);
              lastUpdateRef.current = remoteUpdated;
              setTimeout(() => { skipNextPush.current = false; }, 1000);
          }
      })
      .subscribe();
    
    realtimeChannel.current = channel;
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    let initId = localStorage.getItem("tokyoTripId");
    let initSecret = localStorage.getItem("tokyoTripSecret");

    const urlParams = new URLSearchParams(window.location.search);
    const urlTrip = urlParams.get("trip");
    const urlSecret = urlParams.get("secret");

    if (urlTrip && urlSecret) {
      initId = urlTrip;
      initSecret = urlSecret;
    } else if (!initId || !initSecret) {
      initId = "trip_" + generateToken();
      initSecret = "sec_" + generateToken();
    }

    localStorage.setItem("tokyoTripId", initId!);
    localStorage.setItem("tokyoTripSecret", initSecret!);
    setTimeout(() => {
      setTripId(initId!);
      setTripSecret(initSecret!);
    }, 0);

    // Initialize state from localStorage (one-time hydration from external store)
    /* eslint-disable react-hooks/set-state-in-effect -- Intentional one-time hydration from localStorage on mount */
    const savedItin = localStorage.getItem("tokyoItinerary");
    if (savedItin) try { _setItinerary(JSON.parse(savedItin)); } catch { /* ignore parse errors */ }
    const savedBudget = localStorage.getItem("tokyoBudget");
    if (savedBudget) try { _setBudgetItems(JSON.parse(savedBudget)); } catch { /* ignore parse errors */ }
    const savedLimit = localStorage.getItem("tokyoBudgetLimit");
    if (savedLimit) try { _setBudgetLimit(JSON.parse(savedLimit)); } catch { /* ignore parse errors */ }
    const savedFoods = localStorage.getItem("tokyoCustomFoods");
    if (savedFoods) try { _setCustomFoods(JSON.parse(savedFoods)); } catch { /* ignore parse errors */ }
    /* eslint-enable react-hooks/set-state-in-effect */

    const client = createClient(SUPABASE_URL, SUPABASE_KEY);
    supabase.current = client;

    connectToTrip(initId!, initSecret!, client).then(() => {
        setIsLoaded(true);
    });

    return () => { if (realtimeChannel.current) client.removeChannel(realtimeChannel.current); };
  }, [connectToTrip]);

  useEffect(() => {
    if (!isLoaded || skipNextPush.current || !supabase.current || !tripId) return;

    const push = async () => {
        const now = new Date().toISOString();
        const { error } = await supabase.current!.from("sync_state").upsert({
            id: "state_" + tripId,
            trip_id: tripId,
            trip_secret: tripSecret,
            itinerary,
            budget_limit: budgetLimit,
            budget_items: budgetItems,
            custom_foods: customFoods,
            updated_at: now
        }, { onConflict: "id" })
        .setHeader("x-trip-secret", tripSecret);
        
        if (error) {
            console.error("[Sync] Push failed:", error);
        } else {
            lastUpdateRef.current = new Date(now).getTime();
        }
    };

    const timer = setTimeout(push, 2000);
    return () => clearTimeout(timer);
  }, [itinerary, budgetLimit, budgetItems, customFoods, isLoaded, tripId, tripSecret]);

  const loginToTrip = async (id: string, secret: string) => {
    if (!supabase.current) return false;
    const { data } = await supabase.current.from("sync_state").select("*").eq("trip_id", id).maybeSingle();
    if (data && data.trip_secret !== secret) {
        console.warn("代號已存在，但密碼錯誤！");
        return false;
    }
    localStorage.setItem("tokyoTripId", id);
    localStorage.setItem("tokyoTripSecret", secret);
    setTripId(id);
    setTripSecret(secret);
    await connectToTrip(id, secret, supabase.current);
    return true;
  };

  const setItinerary = (val: Itinerary) => { _setItinerary(val); localStorage.setItem("tokyoItinerary", JSON.stringify(val)); };
  const setBudgetItems = (val: BudgetItem[]) => { _setBudgetItems(val); localStorage.setItem("tokyoBudget", JSON.stringify(val)); };
  const setBudgetLimit = (val: number) => { _setBudgetLimit(val); localStorage.setItem("tokyoBudgetLimit", JSON.stringify(val)); };
  const setCustomFoods = (val: CustomFood[]) => { _setCustomFoods(val); localStorage.setItem("tokyoCustomFoods", JSON.stringify(val)); };

  const getShareLink = () => {
    if (typeof window === "undefined") return "";
    const url = new URL(window.location.origin);
    url.searchParams.set("trip", tripId);
    url.searchParams.set("secret", tripSecret);
    return url.toString();
  };

  return (
    <TripContext.Provider value={{
      isLoaded, itinerary, budgetItems, budgetLimit, customFoods, tripId, tripSecret,
      setItinerary, setBudgetItems, setBudgetLimit, setCustomFoods, loginToTrip, getShareLink
    }}>
      {children}
    </TripContext.Provider>
  );
}

export function useTrip() {
  const context = useContext(TripContext);
  if (context === undefined) throw new Error("useTrip must be used within a TripProvider");
  return context;
}
