export type TokyoForecastDay = {
  date: string;
  weather: string;
  tempMax: string;
  tempMin: string;
  pop: string;
};

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

/**
 * JMA 的短期 temps 是「時點溫度」，不是固定的 [最低, 最高]。
 * 當日最低溫在上午發布時通常已不再提供，因此明確顯示「--」，
 * 避免把兩個時點值誤標成 32–32°C。隔日起使用週間預報的
 * tempsMin / tempsMax 欄位。
 */
export function parseTokyoForecast(payload: unknown): TokyoForecastDay[] {
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
  const pops = strings(firstArea(shortPop)?.pops);
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
    result.push({
      date: dateLabel(todayIso),
      weather: weatherCodes[0] || "",
      tempMax: todayTemperature?.max || "--",
      tempMin: "--",
      pop: pops[0] || "--",
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
      pop: weeklyPops[index] || "--",
    });
  });

  return result.slice(0, 7);
}
