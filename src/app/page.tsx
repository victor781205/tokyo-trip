"use client";

import { useState } from "react";
import { Navigation } from "@/components/Navigation";
import { Hero } from "@/components/Hero";
import { FlightInfo } from "@/components/FlightInfo";
import { TransferGuide } from "@/components/TransferGuide";
import { HotelInfo } from "@/components/HotelInfo";
import { RouteMap } from "@/components/RouteMap";
import { Itinerary } from "@/components/Itinerary";
import { BudgetTracker } from "@/components/BudgetTracker";
import { CurrencyConverter } from "@/components/CurrencyConverter";
import { WeatherForecast } from "@/components/WeatherForecast";
import { Food } from "@/components/Food";
import { Tips } from "@/components/Tips";

export default function Home() {
  const [activeTab, setActiveTab] = useState("hero");

  const renderContent = () => {
    switch (activeTab) {
      case "hero":
        return <Hero />;
      case "flights":
        return <FlightInfo />;
      case "transfer":
        return <TransferGuide />;
      case "hotel":
        return <HotelInfo />;
      case "routemap":
        return <RouteMap />;
      case "weather":
        return <WeatherForecast />;
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
      case "tips":
        return <Tips />;
      default:
        return <Hero />;
    }
  };

  return (
    <main className="min-h-screen pt-16 transition-all duration-500">
      <Navigation activeTab={activeTab} setActiveTab={setActiveTab} />

      <div className="max-w-7xl mx-auto pb-10">
          <div key={activeTab} className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            {renderContent()}
          </div>
      </div>

      <footer className="bg-white dark:bg-slate-900 border-t border-gray-100 dark:border-slate-800 py-12 text-center text-base transition-colors">    
        <div className="max-w-4xl mx-auto px-6">
          <h3 className="text-2xl font-bold mb-4 text-primary">🗼 東京自由行行程規劃</h3>

          <div className="flex justify-center gap-6 mb-8 text-gray-500 font-bold">
             <span>2026.09.01 - 09.06</span>
             <span>•</span>
             <span>Powered by Victor</span>
          </div>
          <p className="text-gray-400 opacity-60">© 2026 Tokyo Trip Planner. Crafted with ❤️ for travelers.</p>
        </div>
      </footer>
    </main>
  );
}
