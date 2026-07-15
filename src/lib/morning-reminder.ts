import { formatClockMinutes, parseClockMinutes } from "@/lib/travel-mode";

export function buildMorningReminderBody(
  activities: { time: string; name: string }[],
) {
  const summary = activities
    .slice(0, 4)
    .map((activity) => `${activity.time} ${activity.name}`)
    .join("、");
  const firstMinutes = parseClockMinutes(activities[0]?.time ?? "");
  const preparationHint = firstMinutes === null
    ? ""
    : `第一站 ${activities[0].time}，建議 ${formatClockMinutes(firstMinutes - 30)} 開始準備。`;
  return `${preparationHint}共 ${activities.length} 個活動：${summary}`;
}
