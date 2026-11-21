import type { SchemeKind } from "./schemas";
import type { ExercisePart, LoggedSet, RecordValue } from "./types";

export interface RecordScheme {
  id: string;
  name: string;
  position: number;
  kind: SchemeKind;
  sets: number | null;
  reps: number | null;
}

export interface ScoredEntry {
  date: string;
  scheme: RecordScheme;
  sets: LoggedSet[];
}

export function entryResultKg(entry: ScoredEntry): number | null {
  const { scheme } = entry;
  const successful = entry.sets.filter((set) => set.success);
  if (scheme.kind === "max") {
    const qualifying = successful.filter((set) => set.reps >= (scheme.reps ?? 1));
    return qualifying.length ? Math.max(...qualifying.map((set) => set.weightKg)) : null;
  }
  if (scheme.kind === "fixed") {
    const completed = entry.sets.length >= (scheme.sets ?? 1)
      && entry.sets.every((set) => set.success && set.reps >= (scheme.reps ?? 1));
    return completed ? Math.min(...entry.sets.map((set) => set.weightKg)) : null;
  }
  return null;
}

export function schemeCovers(done: RecordScheme, target: RecordScheme): boolean {
  if (done.kind === "free" || target.kind === "free") return false;
  if (target.kind === "max") return (done.reps ?? 0) >= (target.reps ?? 1);
  return done.kind === "fixed" && (done.sets ?? 0) >= (target.sets ?? 1) && (done.reps ?? 0) >= (target.reps ?? 1);
}

export function computeRecords(entries: ScoredEntry[], schemes: RecordScheme[]): RecordValue[] {
  const results = entries
    .map((entry) => ({ entry, weightKg: entryResultKg(entry) }))
    .filter((result): result is { entry: ScoredEntry; weightKg: number } => result.weightKg !== null && result.weightKg > 0);

  const records: RecordValue[] = [];
  for (const target of [...schemes].sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, undefined, { numeric: true }))) {
    let best: (typeof results)[number] | undefined;
    for (const result of results) {
      if (!schemeCovers(result.entry.scheme, target)) continue;
      const isHeavier = !best || result.weightKg > best.weightKg;
      const isEarlierTie = best && result.weightKg === best.weightKg && result.entry.date < best.entry.date;
      const isSameDayTie = best && result.weightKg === best.weightKg && result.entry.date === best.entry.date;
      const isBetterSource = isSameDayTie && best!.entry.scheme.id !== target.id
        && (result.entry.scheme.id === target.id || result.entry.scheme.position < best!.entry.scheme.position);
      if (isHeavier || isEarlierTie || isBetterSource) best = result;
    }
    if (best) {
      records.push({
        schemeId: target.id,
        schemeName: target.name,
        weightKg: best.weightKg,
        date: best.entry.date,
        fromSchemeName: best.entry.scheme.id === target.id ? null : best.entry.scheme.name,
      });
    }
  }
  return records;
}

export function exerciseDisplayName(name: string | null, parts: ExercisePart[]): string {
  if (name?.trim()) return name.trim();
  return parts
    .map((part) => (part.reps > 1 ? `${part.reps} ${part.movementName}` : part.movementName))
    .join(" + ");
}
