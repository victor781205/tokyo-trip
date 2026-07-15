export type TokyoForecastDay = {
  date: string;
  weather: string;
  tempMax: string;
  tempMin: string;
  pop: string;
  temperatureNote?: string;
};

export type TokyoObservedTemperature = {
  date: string;
  min: string;
  max: string;
  observedAt?: string;
};

export type JmaWeatherKind = "sunny" | "cloudy" | "rain" | "snow" | "unknown";

export function getJmaWeatherKind(code: string): JmaWeatherKind {
  const value = Number.parseInt(code, 10);
  if (Number.isNaN(value)) return "unknown";
  if (value >= 100 && value < 200) return "sunny";
  if (value >= 200 && value < 300) return "cloudy";
  if (value >= 300 && value < 400) return "rain";
  if (value >= 400 && value < 500) return "snow";
  return "unknown";
}

export function getJmaWeatherLabel(code: string): string {
  switch (getJmaWeatherKind(code)) {
    case "sunny": return "晴";
    case "cloudy": return "多雲";
    case "rain": return "雨";
    case "snow": return "雪";
    default: return "天氣未知";
  }
}

type JsonRecord = Record<string, unknown>;

const record = (value: unknown): JsonRecord | null =>
  typeof value === "object" && value !== null ? (value as JsonRecord) : null;

const array = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const strings = (value: unknown): string[] =>
  array(value).map((item) => String(item ?? ""));

function firstArea(series: unknown): JsonRecord | null {
  const areas = array(record(series)?.areas);
  return record(areas[0]);
}

function dateLabel(isoDate: string): string {
  const [, month, day] = isoDate.split("-");
  return `${Number(month)}/${Number(day)}`;
}

function aggregatePopsByDate(timeDefines: string[], pops: string[]): Map<string, string> {
  const result = new Map<string, string>();
  timeDefines.forEach((dateTime, index) => {
    const isoDate = dateTime.slice(0, 10);
    const pop = pops[index];
    const numericPop = Number.parseInt(pop, 10);
    if (!isoDate || Number.isNaN(numericPop)) return;

    const current = Number.parseInt(result.get(isoDate) ?? "", 10);
    if (Number.isNaN(current) || numericPop > current) {
      result.set(isoDate, String(numericPop));
    }
  });
  return result;
}

function formatTemperature(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Parse the Tokyo AMeDAS station's ten-minute observations for one date. */
export function parseTokyoObservedTemperature(
  payloads: unknown[],
  isoDate: string,
): TokyoObservedTemperature | null {
  const compactDate = isoDate.replaceAll("-", "");
  if (!/^\d{8}$/.test(compactDate)) return null;

  const samples: Array<{ key: string; value: number }> = [];
  payloads.forEach((payload) => {
    const root = record(payload);
    if (!root) return;
    Object.entries(root).forEach(([key, rawObservation]) => {
      if (!/^\d{14}$/.test(key) || !key.startsWith(compactDate)) return;
      const temperature = array(record(rawObservation)?.temp);
      const value = Number(temperature[0]);
      const quality = temperature.length > 1 ? Number(temperature[1]) : 0;
      if (!Number.isFinite(value) || !Number.isFinite(quality) || quality > 1) return;
      samples.push({ key, value });
    });
  });

  if (samples.length === 0) return null;
  samples.sort((a, b) => a.key.localeCompare(b.key));
  const values = samples.map((sample) => sample.value);
  const latest = samples.at(-1)?.key;
  return {
    date: isoDate,
    min: formatTemperature(Math.min(...values)),
    max: formatTemperature(Math.max(...values)),
    observedAt: latest ? `${latest.slice(8, 10)}:${latest.slice(10, 12)}` : undefined,
  };
}

/**
 * JMA 短期資料通常只提供今天的預報最高溫，最低溫會缺席；傍晚
 * 甚至連今天最高溫也會從預報序列移除。第二參數可帶東京 AMeDAS
 * 當日實測範圍，補齊第一張卡而不把明天的預報誤標成今天。
 */
export function parseTokyoForecast(
  payload: unknown,
  observed?: TokyoObservedTemperature | null,
): TokyoForecastDay[] {
  const roots = array(payload);
  const shortRoot = record(roots[0]);
  const weeklyRoot = record(roots[1]);
  if (!shortRoot) return [];

  const shortSeries = array(shortRoot.timeSeries);
  const shortWeather = record(shortSeries[0]);
  const shortPop = record(shortSeries[1]);
  const shortTemps = record(shortSeries[2]);

  const shortDates = strings(shortWeather?.timeDefines);
  const weatherCodes = strings(firstArea(shortWeather)?.weatherCodes);
  const popTimes = strings(shortPop?.timeDefines);
  const pops = strings(firstArea(shortPop)?.pops);
  const shortPopByDate = aggregatePopsByDate(popTimes, pops);
  const undatedShortPop = popTimes.length === 0 ? pops[0] : "";
  const temperatureTimes = strings(shortTemps?.timeDefines);
  const temperatures = strings(firstArea(shortTemps)?.temps);
  const todayIso = shortDates[0]?.slice(0, 10);
  const shortTemperatureByDate = new Map<string, { min?: string; max?: string }>();

  temperatureTimes.forEach((dateTime, index) => {
    const isoDate = dateTime.slice(0, 10);
    const hour = dateTime.slice(11, 13);
    const value = temperatures[index];
    if (!isoDate || !value) return;
    const entry = shortTemperatureByDate.get(isoDate) ?? {};
    // JMA 短期預報以 00:00 表示最低溫、09:00 表示最高溫。
    if (hour === "00") entry.min = value;
    if (hour === "09") entry.max = value;
    shortTemperatureByDate.set(isoDate, entry);
  });

  const result: TokyoForecastDay[] = [];
  if (todayIso) {
    const todayTemperature = shortTemperatureByDate.get(todayIso);
    const observedToday = observed?.date === todayIso ? observed : null;
    const observedMin = observedToday?.min;
    const observedMax = !todayTemperature?.max ? observedToday?.max : undefined;
    const observedParts = [observedMin && "低溫", observedMax && "高溫"].filter(Boolean);
    result.push({
      date: dateLabel(todayIso),
      weather: weatherCodes[0] || "",
      tempMax: todayTemperature?.max || observedMax || "--",
      tempMin: observedMin || "--",
      pop: shortPopByDate.get(todayIso) || undatedShortPop || "--",
      temperatureNote: observedParts.length > 0
        ? `今日${observedParts.join("、")}為${observedToday?.observedAt ? `截至 ${observedToday.observedAt} ` : ""}實測值`
        : undefined,
    });
  }

  const weeklySeries = array(weeklyRoot?.timeSeries);
  const weeklyWeather = record(weeklySeries[0]);
  const weeklyTemps = record(weeklySeries[1]);
  const weeklyDates = strings(weeklyWeather?.timeDefines);
  const weeklyCodes = strings(firstArea(weeklyWeather)?.weatherCodes);
  const weeklyPops = strings(firstArea(weeklyWeather)?.pops);
  const weeklyMins = strings(firstArea(weeklyTemps)?.tempsMin);
  const weeklyMaxes = strings(firstArea(weeklyTemps)?.tempsMax);

  weeklyDates.forEach((dateTime, index) => {
    const isoDate = dateTime.slice(0, 10);
    if (!isoDate || isoDate === todayIso || result.length >= 7) return;
    const shortTemperature = shortTemperatureByDate.get(isoDate);
    result.push({
      date: dateLabel(isoDate),
      weather: weeklyCodes[index] || "",
      tempMax: shortTemperature?.max || weeklyMaxes[index] || "--",
      tempMin: shortTemperature?.min || weeklyMins[index] || "--",
      pop: shortPopByDate.get(isoDate) || weeklyPops[index] || "--",
    });
  });

  return result.slice(0, 7);
}

/** Validate the compact response returned by the app's weather route. */
export function parseTokyoForecastResponse(payload: unknown): TokyoForecastDay[] {
  const items = array(record(payload)?.forecast);
  return items.flatMap((item) => {
    const value = record(item);
    if (!value) return [];
    const date = typeof value.date === "string" ? value.date : "";
    const weather = typeof value.weather === "string" ? value.weather : "";
    const tempMax = typeof value.tempMax === "string" ? value.tempMax : "";
    const tempMin = typeof value.tempMin === "string" ? value.tempMin : "";
    const pop = typeof value.pop === "string" ? value.pop : "";
    if (!date || !weather || !tempMax || !tempMin || !pop) return [];
    return [{
      date,
      weather,
      tempMax,
      tempMin,
      pop,
      temperatureNote: typeof value.temperatureNote === "string"
        ? value.temperatureNote.slice(0, 120)
        : undefined,
    }];
  }).slice(0, 7);
}
