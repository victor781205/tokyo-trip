/** Stable identity shared by itinerary UI creation and sync reconciliation. */
function hashWithSeed(value: string, seed: number) {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function activitySyncIdFromSource(sourceId: string) {
  const normalized = sourceId.trim().normalize("NFKC");
  const encoded = encodeURIComponent(normalized);
  if (encoded.length <= 145) return `source:${encoded}`;
  return `source-hash:${hashWithSeed(normalized, 2166136261)}:${hashWithSeed(normalized, 2246822519)}`;
}
