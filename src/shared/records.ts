import type { SchemeKind } from "./schemas";
import type { ExercisePart, LoggedSet, RecordValue } from "./types";

export interface ScoredEntry {
  date: string;
  schemeId: string;
  schemeName: string;
  schemePosition: number;
  kind: SchemeKind;
  targetSets: number | null;
  targetReps: number | null;
  sets: LoggedSet[];
}

export function entryResultKg(entry: ScoredEntry): number | null {
  const successful = entry.sets.filter((set) => set.success);
  if (entry.kind === "max") {
    const qualifying = successful.filter((set) => set.reps >= (entry.targetReps ?? 1));
    return qualifying.length ? Math.max(...qualifying.map((set) => set.weightKg)) : null;
  }
  if (entry.kind === "fixed") {
    const completed = entry.sets.length >= (entry.targetSets ?? 1)
      && entry.sets.every((set) => set.success && set.reps >= (entry.targetReps ?? 1));
    return completed ? Math.min(...entry.sets.map((set) => set.weightKg)) : null;
  }
  return null;
}

export function computeRecords(entries: ScoredEntry[]): RecordValue[] {
  const bestByScheme = new Map<string, RecordValue & { position: number }>();
  for (const entry of entries) {
    const weightKg = entryResultKg(entry);
    if (weightKg === null || weightKg <= 0) continue;
    const best = bestByScheme.get(entry.schemeId);
    if (!best || weightKg > best.weightKg || (weightKg === best.weightKg && entry.date < best.date)) {
      bestByScheme.set(entry.schemeId, { schemeId: entry.schemeId, schemeName: entry.schemeName, weightKg, date: entry.date, position: entry.schemePosition });
    }
  }
  return [...bestByScheme.values()]
    .sort((a, b) => a.position - b.position || a.schemeName.localeCompare(b.schemeName, undefined, { numeric: true }))
    .map(({ position: _position, ...record }) => record);
}

export function exerciseDisplayName(name: string | null, parts: ExercisePart[]): string {
  if (name?.trim()) return name.trim();
  return parts
    .map((part) => (part.reps > 1 ? `${part.reps} ${part.movementName}` : part.movementName))
    .join(" + ");
}
