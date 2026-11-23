import type { MeasureBetter, MeasureUnit } from "../shared/schemas";
import type { BenchmarkMeasure, BenchmarkResult } from "../shared/types";

export const UNIT_LABELS: Record<MeasureUnit, string> = {
  time: "Time",
  rounds_reps: "Rounds + reps",
  reps: "Reps",
  cal: "Calories",
  cm: "cm",
  deg: "Degrees",
  kg: "kg",
  m: "Meters",
};

const UNIT_SUFFIX: Partial<Record<MeasureUnit, string>> = { reps: "reps", cal: "cal", cm: "cm", deg: "°", kg: "kg", m: "m" };
const ROUNDS_FACTOR = 1000;
const COUNT_UNITS: MeasureUnit[] = ["reps", "cal"];

export const TOTAL_MEASURE_ID = "total";

export function defaultBetter(unit: MeasureUnit): MeasureBetter {
  return unit === "time" ? "lower" : "higher";
}

function trimNumber(value: number): string {
  return `${Number(value.toFixed(2))}`;
}

export function formatDuration(seconds: number): string {
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  const secs = String(rounded % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${secs}` : `${minutes}:${secs}`;
}

export function formatMeasureValue(value: number, unit: MeasureUnit, withSuffix = true): string {
  if (unit === "time") return formatDuration(value);
  if (unit === "rounds_reps") return `${Math.floor(value / ROUNDS_FACTOR)}+${Math.round(value % ROUNDS_FACTOR)}`;
  const suffix = UNIT_SUFFIX[unit];
  if (!withSuffix || !suffix) return trimNumber(value);
  return unit === "deg" ? `${trimNumber(value)}°` : `${trimNumber(value)} ${suffix}`;
}

export function formatImprovement(delta: number, unit: MeasureUnit, better: MeasureBetter): string {
  const improvement = better === "higher" ? delta : -delta;
  if (improvement === 0) return "±0";
  if (unit === "time") return `${formatDuration(Math.abs(delta))} ${delta < 0 ? "faster" : "slower"}`;
  const sign = improvement > 0 ? "+" : "−";
  const magnitude = Math.abs(delta);
  if (unit === "rounds_reps") return `${sign}${magnitude >= ROUNDS_FACTOR ? `${Math.floor(magnitude / ROUNDS_FACTOR)} rd ` : ""}${Math.round(magnitude % ROUNDS_FACTOR)} reps`;
  return `${sign}${formatMeasureValue(magnitude, unit)}`;
}

export function parseDuration(text: string): number | null {
  const parts = text.trim().split(":").map((part) => part.trim());
  if (parts.length < 1 || parts.length > 3 || parts.some((part) => !/^\d+$/.test(part))) return null;
  return parts.map(Number).reduce((total, part) => total * 60 + part, 0);
}

export function encodeRoundsReps(rounds: number, reps: number): number {
  return rounds * ROUNDS_FACTOR + reps;
}

export function decodeRoundsReps(value: number): { rounds: number; reps: number } {
  return { rounds: Math.floor(value / ROUNDS_FACTOR), reps: Math.round(value % ROUNDS_FACTOR) };
}

export function totalMeasure(measures: BenchmarkMeasure[]): BenchmarkMeasure | null {
  const countable = measures.length >= 2 && measures.every((measure) => COUNT_UNITS.includes(measure.unit) && measure.better === "higher");
  if (!countable) return null;
  const sameUnit = measures.every((measure) => measure.unit === measures[0].unit);
  return { id: TOTAL_MEASURE_ID, name: "Total", unit: sameUnit ? measures[0].unit : "reps", better: "higher" };
}

export function resultValue(result: BenchmarkResult, measure: BenchmarkMeasure, measures: BenchmarkMeasure[]): number | undefined {
  if (measure.id !== TOTAL_MEASURE_ID) return result.values[measure.id];
  const values = measures.map((candidate) => result.values[candidate.id]);
  return values.every((value) => value !== undefined) ? values.reduce((sum, value) => sum + value, 0) : undefined;
}

export function isBetter(candidate: number, reference: number, better: MeasureBetter): boolean {
  return better === "higher" ? candidate > reference : candidate < reference;
}
