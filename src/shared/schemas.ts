import { z } from "zod";

const id = z.string().min(1);
const trimmedName = z.string().trim().min(1).max(100);

export const movementInput = z.object({ name: trimmedName });

export const exercisePartInput = z.object({
  movementId: id,
  reps: z.number().int().min(1).max(20),
});

export const exerciseInput = z.object({
  name: z.string().trim().max(100).nullable().optional(),
  parts: z.array(exercisePartInput).min(1).max(8),
  archived: z.boolean().optional(),
});

export const schemeKind = z.enum(["max", "fixed", "free"]);

export const schemeInput = z
  .object({
    name: trimmedName,
    kind: schemeKind,
    sets: z.number().int().min(1).max(20).nullable().optional(),
    reps: z.number().int().min(1).max(50).nullable().optional(),
    hidden: z.boolean().optional(),
  })
  .refine((scheme) => scheme.kind !== "fixed" || (scheme.sets && scheme.reps), {
    message: "A fixed scheme needs sets and reps",
  })
  .refine((scheme) => scheme.kind !== "max" || scheme.reps, {
    message: "A max scheme needs a rep count",
  });

export const setInput = z.object({
  reps: z.number().int().min(1).max(100),
  weightKg: z.number().min(0).max(1000),
  success: z.boolean(),
});

export const entryInput = z.object({
  exerciseId: id,
  schemeId: id,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(1000).nullable().optional(),
  sets: z.array(setInput).min(1).max(50),
});

export type MovementInput = z.infer<typeof movementInput>;
export type ExerciseInput = z.infer<typeof exerciseInput>;
export type SchemeInput = z.infer<typeof schemeInput>;
export type SetInput = z.infer<typeof setInput>;
export type EntryInput = z.infer<typeof entryInput>;
export type SchemeKind = z.infer<typeof schemeKind>;
