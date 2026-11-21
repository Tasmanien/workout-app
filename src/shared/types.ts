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
