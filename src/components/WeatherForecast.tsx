"use client";

import { useEffect, useState } from "react";
import { Cloud, CloudRain, Sun, CloudLightning, Calendar } from "lucide-react";

type WeatherData = {
  date: string;
  weather: string;
  tempMax: string;
  tempMin: string;
  pop: string; // Probability of precipitation
};

export function WeatherForecast() {
  const [forecast, setForecast] = useState<WeatherData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch("https://www.jma.go.jp/bosai/forecast/data/forecast/130000.json");
        const data = await res.json();

        // JMA JSON structure is complex. We need the weekly forecast (index 1 in the root array)
        const weekly = data[1].timeSeries[0];
        const temps = data[1].timeSeries[1]; // Max/Min temps

        const processed: WeatherData[] = weekly.timeDefines.map((dateStr: string, i: number) => {
          const date = new Date(dateStr);
          return {
            date: `${date.getMonth() + 1}/${date.getDate()}`,
            weather: weekly.areas[0].weatherCodes[i], // simplified: using code for icon
            tempMax: temps.areas[0].tempsMax[i] || "--",
            tempMin: temps.areas[0].tempsMin[i] || "--",
            pop: "--", // PoP is in a different series, often empty for later days
          };
        });

        setForecast(processed.slice(0, 7));
      } catch (e) {
        console.error("Weather fetch failed", e);
      } finally {
        setLoading(false);
      }
    }
    fetchWeather();
  }, []);

  const getWeatherIcon = (code: string) => {
    const c = parseInt(code);
    if (c < 200) return <Sun className="w-8 h-8 text-yellow-500" />;
    if (c < 300) return <Cloud className="w-8 h-8 text-gray-400" />;
    if (c < 400) return <CloudRain className="w-8 h-8 text-blue-400" />;
    return <CloudLightning className="w-8 h-8 text-purple-400" />;
  };

  if (loading) {
    return (
      <section id="weather" className="py-20 px-6 max-w-5xl mx-auto">
        <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 md:p-12 shadow-xl border border-gray-100 dark:border-slate-700">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
            <div>
              <div className="h-9 w-48 bg-gray-200 dark:bg-slate-700 rounded-xl animate-pulse mb-3" />
              <div className="h-5 w-36 bg-gray-100 dark:bg-slate-800 rounded-lg animate-pulse" />
            </div>
            <div className="h-10 w-32 bg-gray-100 dark:bg-slate-700 rounded-2xl animate-pulse" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex flex-col items-center p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl">
                <div className="h-5 w-10 bg-gray-200 dark:bg-slate-700 rounded-lg animate-pulse mb-3" />
                <div className="w-10 h-10 bg-gray-200 dark:bg-slate-700 rounded-full animate-pulse mb-3" />
                <div className="flex gap-2">
                  <div className="h-5 w-8 bg-red-100 dark:bg-red-900/20 rounded animate-pulse" />
                  <div className="h-5 w-8 bg-blue-100 dark:bg-blue-900/20 rounded animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="weather" className="py-20 px-6 max-w-5xl mx-auto">
      <div className="bg-white dark:bg-slate-800 rounded-[3rem] p-8 md:p-12 shadow-xl border border-gray-100 dark:border-slate-700">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h2 className="text-3xl font-bold mb-2 flex items-center gap-2">
              <Calendar className="text-primary w-8 h-8" /> 東京一週天氣
            </h2>
            <p className="text-gray-500">資料來源：日本氣象廳 (JMA)</p>
          </div>
          <div className="bg-primary/10 text-primary px-6 py-2 rounded-2xl font-bold">
            Tokyo, Japan
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          {forecast.map((day, i) => (
            <div key={i} className="flex flex-col items-center p-4 bg-gray-50 dark:bg-slate-900/50 rounded-2xl border border-transparent hover:border-primary/30 transition-all">
              <span className="text-base font-bold text-gray-500 mb-3">{day.date}</span>
              <div className="mb-3">{getWeatherIcon(day.weather)}</div>
              <div className="flex gap-2 font-black">
                <span className="text-red-500">{day.tempMax}°</span>
                <span className="text-blue-500 opacity-50">{day.tempMin}°</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
