import type { SchemeKind } from "./schemas";

export interface Movement {
  id: string;
  name: string;
  usage: number;
}

export interface ExercisePart {
  movementId: string;
  movementName: string;
  reps: number;
}

export interface RecordValue {
  schemeId: string;
  schemeName: string;
  weightKg: number;
  date: string;
  fromSchemeName: string | null;
}

export interface ExerciseSummary {
  id: string;
  name: string | null;
  displayName: string;
  archived: boolean;
  parts: ExercisePart[];
  entryCount: number;
  lastDate: string | null;
  records: RecordValue[];
}

export interface Scheme {
  id: string;
  name: string;
  kind: SchemeKind;
  sets: number | null;
  reps: number | null;
  hidden: boolean;
  usage: number;
}

export interface LoggedSet {
  reps: number;
  weightKg: number;
  success: boolean;
}

export interface Entry {
  id: string;
  exerciseId: string;
  schemeId: string;
  schemeName: string;
  date: string;
  notes: string | null;
  source: "app" | "jefit";
  sets: LoggedSet[];
}

export interface ExerciseDetail extends ExerciseSummary {
  entries: Entry[];
}

export interface BenchmarkMeasure {
  id: string;
  name: string;
  unit: import("./schemas").MeasureUnit;
  better: import("./schemas").MeasureBetter;
}

export interface BenchmarkResult {
  id: string;
  date: string;
  variant: string | null;
  notes: string | null;
  values: Record<string, number>;
}

export interface BenchmarkSummary {
  id: string;
  name: string;
  category: string;
  protocol: string | null;
  archived: boolean;
  measures: BenchmarkMeasure[];
  resultCount: number;
  lastResult: BenchmarkResult | null;
}

export interface BenchmarkDetail extends BenchmarkSummary {
  results: BenchmarkResult[];
}
