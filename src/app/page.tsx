"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { FlightInfo } from "@/components/FlightInfo";
import { HotelInfo } from "@/components/HotelInfo";
import { RouteMap } from "@/components/RouteMap";
import { Itinerary } from "@/components/Itinerary";
import { BudgetTracker } from "@/components/BudgetTracker";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { WeatherForecast } from "@/components/WeatherForecast";
import { Food } from "@/components/Food";
import { Tips } from "@/components/Tips";
import { EmergencyContacts } from "@/components/EmergencyContacts";
import { PackingList } from "@/components/PackingList";
import { JapanesePhrases } from "@/components/JapanesePhrases";
import { OfflineIndicator } from "@/components/OfflineIndicator";

export default function Home() {
  const [activeTab, setActiveTab] = useState("hero");

  const renderContent = () => {
    switch (activeTab) {
      case "hero":
        return <Hero onNavigate={setActiveTab} />;
      case "flights":
        return <FlightInfo />;
      case "tripprep":
        return (
          <div>
            <WeatherForecast />
            <div className="mt-2">
              <PackingList />
            </div>
          </div>
        );
      case "transport":
        return (
          <div className="space-y-8">
            <HotelInfo />
            <RouteMap />
          </div>
        );
      case "itinerary":
        return <Itinerary />;
      case "tools":
        return (
          <div className="space-y-8">
            <BudgetTracker />
            <CurrencyConverter />
          </div>
        );
      case "food":
        return <Food />;
      case "assistant":
        return (
          <div className="space-y-8">
            <EmergencyContacts />
            <JapanesePhrases />
            <Tips />
          </div>
        );
      default:
        return <Hero onNavigate={setActiveTab} />;
    }
  };

  return (
    <main className="flex flex-col min-h-dvh pt-16 transition-all duration-500">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="flex-1 max-w-7xl mx-auto px-4 md:px-6 pb-4 w-full">
        <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
          {renderContent()}
        </div>
      </div>

      <OfflineIndicator />

      <footer className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 py-8 text-center text-sm transition-colors mt-auto">
        <div className="max-w-4xl mx-auto px-6">
          <h3 className="text-xl font-bold mb-3 text-primary">🗼 東京自由行行程規劃</h3>
          <div className="flex flex-wrap justify-center gap-2 sm:gap-6 mb-4 text-xs text-gray-500 font-bold">
            <span>2026.09.01 - 09.06</span>
            <span>•</span>
            <span>Powered by Victor</span>
          </div>
          <p className="text-gray-400 opacity-60 text-xs">© 2026 Tokyo Trip Planner</p>
        </div>
      </footer>
    </main>
  );
}
