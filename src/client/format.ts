import type { LoggedSet } from "../shared/types";

export function formatKg(weightKg: number): string {
  if (weightKg === 0) return "BW";
  return `${Number(weightKg.toFixed(2))}`;
}

export function formatDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

export function todayIso(): string {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

export function summarizeSets(sets: LoggedSet[]): string {
  const groups: { count: number; set: LoggedSet }[] = [];
  for (const set of sets) {
    const last = groups.at(-1);
    if (last && last.set.reps === set.reps && last.set.weightKg === set.weightKg && last.set.success === set.success) last.count++;
    else groups.push({ count: 1, set });
  }
  return groups
    .map(({ count, set }) => {
      const base = `${formatKg(set.weightKg)}×${set.reps}`;
      const repeated = count > 1 ? `${count}×(${base})` : base;
      return set.success ? repeated : `${repeated}✗`;
    })
    .join("  ");
}

export function roundTo(value: number, step: number): number {
  return Math.round(value / step) * step;
}
