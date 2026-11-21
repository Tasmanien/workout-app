import { Hono } from "hono";
import type { z } from "zod";
import { requireAccess } from "./auth";
import { entryInput, exerciseInput, movementInput, schemeInput } from "../shared/schemas";
import { computeRecords, exerciseDisplayName, type RecordScheme, type ScoredEntry } from "../shared/records";
import type { Entry, ExerciseDetail, ExercisePart, ExerciseSummary, Movement, Scheme } from "../shared/types";

const app = new Hono<{ Bindings: Env }>().basePath("/api");

app.use("*", requireAccess);

app.onError((error, c) => {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("UNIQUE constraint failed")) return c.json({ error: "This name already exists" }, 409);
  if (message.includes("FOREIGN KEY constraint failed")) return c.json({ error: "Unknown reference" }, 400);
  console.error(error);
  return c.json({ error: "Internal error" }, 500);
});

async function parseBody<T extends z.ZodType>(request: Request, schema: T): Promise<z.infer<T> | Response> {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (parsed.success) return parsed.data;
  return Response.json({ error: parsed.error.issues.map((issue) => issue.message).join(", ") }, { status: 400 });
}

interface ExerciseRow { id: string; name: string | null; archived: number }
interface PartRow { exercise_id: string; movement_id: string; movement_name: string; reps: number }
interface StatsRow { exercise_id: string; entry_count: number; last_date: string }
interface ScoredSetRow { exercise_id: string; entry_id: string; date: string; scheme_id: string; reps: number; weight_kg: number; success: number }

async function loadExerciseSummaries(db: D1Database, exerciseId?: string): Promise<ExerciseSummary[]> {
  const filter = exerciseId ? "WHERE e.id = ?1" : "";
  const bind = (statement: D1PreparedStatement) => (exerciseId ? statement.bind(exerciseId) : statement);
  const [exercises, parts, stats, scoredSets, schemeRows] = await db.batch([
    bind(db.prepare(`SELECT e.id, e.name, e.archived FROM exercise e ${filter}`)),
    bind(db.prepare(
      `SELECT ep.exercise_id, ep.movement_id, m.name AS movement_name, ep.reps
       FROM exercise_part ep JOIN movement m ON m.id = ep.movement_id JOIN exercise e ON e.id = ep.exercise_id
       ${filter} ORDER BY ep.exercise_id, ep.position`,
    )),
    bind(db.prepare(
      `SELECT le.exercise_id, COUNT(*) AS entry_count, MAX(le.date) AS last_date
       FROM log_entry le JOIN exercise e ON e.id = le.exercise_id ${filter} GROUP BY le.exercise_id`,
    )),
    bind(db.prepare(
      `SELECT le.exercise_id, le.id AS entry_id, le.date, le.scheme_id, s.reps, s.weight_kg, s.success
       FROM log_set s JOIN log_entry le ON le.id = s.log_entry_id JOIN scheme sc ON sc.id = le.scheme_id
       JOIN exercise e ON e.id = le.exercise_id
       ${filter ? `${filter} AND` : "WHERE"} sc.kind <> 'free'
       ORDER BY le.id, s.position`,
    )),
    db.prepare("SELECT id, name, position, kind, sets, reps FROM scheme WHERE kind <> 'free'"),
  ]);
  const recordSchemes = schemeRows.results as unknown as RecordScheme[];
  const schemeById = new Map(recordSchemes.map((scheme) => [scheme.id, scheme]));

  const partsByExercise = new Map<string, ExercisePart[]>();
  for (const row of parts.results as unknown as PartRow[]) {
    const list = partsByExercise.get(row.exercise_id) ?? [];
    list.push({ movementId: row.movement_id, movementName: row.movement_name, reps: row.reps });
    partsByExercise.set(row.exercise_id, list);
  }
  const statsByExercise = new Map((stats.results as unknown as StatsRow[]).map((row) => [row.exercise_id, row]));
  const entriesByExercise = new Map<string, Map<string, ScoredEntry>>();
  for (const row of scoredSets.results as unknown as ScoredSetRow[]) {
    const exerciseEntries = entriesByExercise.get(row.exercise_id) ?? new Map<string, ScoredEntry>();
    entriesByExercise.set(row.exercise_id, exerciseEntries);
    const scheme = schemeById.get(row.scheme_id);
    if (!scheme) continue;
    let entry = exerciseEntries.get(row.entry_id);
    if (!entry) {
      entry = { date: row.date, scheme, sets: [] };
      exerciseEntries.set(row.entry_id, entry);
    }
    entry.sets.push({ reps: row.reps, weightKg: row.weight_kg, success: row.success === 1 });
  }

  return (exercises.results as unknown as ExerciseRow[]).map((row) => {
    const exerciseParts = partsByExercise.get(row.id) ?? [];
    const exerciseStats = statsByExercise.get(row.id);
    return {
      id: row.id,
      name: row.name,
      displayName: exerciseDisplayName(row.name, exerciseParts),
      archived: row.archived === 1,
      parts: exerciseParts,
      entryCount: exerciseStats?.entry_count ?? 0,
      lastDate: exerciseStats?.last_date ?? null,
      records: computeRecords([...(entriesByExercise.get(row.id)?.values() ?? [])], recordSchemes),
    };
  });
}

interface EntryRow { id: string; exercise_id: string; scheme_id: string; scheme_name: string; date: string; notes: string | null; source: "app" | "jefit" }
interface SetRow { log_entry_id: string; reps: number; weight_kg: number; success: number }

async function loadEntries(db: D1Database, column: "le.exercise_id" | "le.id", value: string): Promise<Entry[]> {
  const [entries, sets] = await db.batch([
    db.prepare(
      `SELECT le.id, le.exercise_id, le.scheme_id, sc.name AS scheme_name, le.date, le.notes, le.source
       FROM log_entry le JOIN scheme sc ON sc.id = le.scheme_id
       WHERE ${column} = ?1 ORDER BY le.date DESC, le.created_at DESC`,
    ).bind(value),
    db.prepare(
      `SELECT s.log_entry_id, s.reps, s.weight_kg, s.success
       FROM log_set s JOIN log_entry le ON le.id = s.log_entry_id
       WHERE ${column} = ?1 ORDER BY s.position`,
    ).bind(value),
  ]);
  const setsByEntry = new Map<string, Entry["sets"]>();
  for (const row of sets.results as unknown as SetRow[]) {
    const list = setsByEntry.get(row.log_entry_id) ?? [];
    list.push({ reps: row.reps, weightKg: row.weight_kg, success: row.success === 1 });
    setsByEntry.set(row.log_entry_id, list);
  }
  return (entries.results as unknown as EntryRow[]).map((row) => ({
    id: row.id,
    exerciseId: row.exercise_id,
    schemeId: row.scheme_id,
    schemeName: row.scheme_name,
    date: row.date,
    notes: row.notes,
    source: row.source,
    sets: setsByEntry.get(row.id) ?? [],
  }));
}

app.get("/movements", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT m.id, m.name, COUNT(ep.movement_id) AS usage
     FROM movement m LEFT JOIN exercise_part ep ON ep.movement_id = m.id
     GROUP BY m.id ORDER BY m.name COLLATE NOCASE`,
  ).all<Movement>();
  return c.json(results);
});

app.post("/movements", async (c) => {
  const body = await parseBody(c.req.raw, movementInput);
  if (body instanceof Response) return body;
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO movement (id, name) VALUES (?1, ?2)").bind(id, body.name).run();
  return c.json({ id, name: body.name, usage: 0 }, 201);
});

app.patch("/movements/:id", async (c) => {
  const body = await parseBody(c.req.raw, movementInput);
  if (body instanceof Response) return body;
  const { meta } = await c.env.DB.prepare("UPDATE movement SET name = ?2 WHERE id = ?1").bind(c.req.param("id"), body.name).run();
  return meta.changes ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

app.delete("/movements/:id", async (c) => {
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT 1 FROM exercise_part WHERE movement_id = ?1 LIMIT 1").bind(id).first();
  if (used) return c.json({ error: "This movement is used by an exercise" }, 409);
  await c.env.DB.prepare("DELETE FROM movement WHERE id = ?1").bind(id).run();
  return c.body(null, 204);
});

function partStatements(db: D1Database, exerciseId: string, parts: { movementId: string; reps: number }[]) {
  return parts.map((part, position) =>
    db.prepare("INSERT INTO exercise_part (exercise_id, position, movement_id, reps) VALUES (?1, ?2, ?3, ?4)")
      .bind(exerciseId, position, part.movementId, part.reps),
  );
}

app.get("/exercises", async (c) => c.json(await loadExerciseSummaries(c.env.DB)));

app.get("/exercises/:id", async (c) => {
  const id = c.req.param("id");
  const [summary] = await loadExerciseSummaries(c.env.DB, id);
  if (!summary) return c.json({ error: "Not found" }, 404);
  const detail: ExerciseDetail = { ...summary, entries: await loadEntries(c.env.DB, "le.exercise_id", id) };
  return c.json(detail);
});

app.post("/exercises", async (c) => {
  const body = await parseBody(c.req.raw, exerciseInput);
  if (body instanceof Response) return body;
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO exercise (id, name, archived) VALUES (?1, ?2, ?3)").bind(id, body.name || null, body.archived ? 1 : 0),
    ...partStatements(c.env.DB, id, body.parts),
  ]);
  return c.json({ id }, 201);
});

app.put("/exercises/:id", async (c) => {
  const body = await parseBody(c.req.raw, exerciseInput);
  if (body instanceof Response) return body;
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT 1 FROM exercise WHERE id = ?1").bind(id).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE exercise SET name = ?2, archived = ?3 WHERE id = ?1").bind(id, body.name || null, body.archived ? 1 : 0),
    c.env.DB.prepare("DELETE FROM exercise_part WHERE exercise_id = ?1").bind(id),
    ...partStatements(c.env.DB, id, body.parts),
  ]);
  return c.body(null, 204);
});

app.delete("/exercises/:id", async (c) => {
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT 1 FROM log_entry WHERE exercise_id = ?1 LIMIT 1").bind(id).first();
  if (used) return c.json({ error: "This exercise has logged sessions; archive it instead" }, 409);
  await c.env.DB.prepare("DELETE FROM exercise WHERE id = ?1").bind(id).run();
  return c.body(null, 204);
});

app.get("/schemes", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT sc.id, sc.name, sc.kind, sc.sets, sc.reps, COUNT(le.id) AS usage
     FROM scheme sc LEFT JOIN log_entry le ON le.scheme_id = sc.id
     GROUP BY sc.id ORDER BY sc.position, sc.name COLLATE NOCASE`,
  ).all<Scheme>();
  return c.json(results);
});

const SCHEME_POSITION = "CASE ?3 WHEN 'max' THEN ?5 WHEN 'fixed' THEN 10 * ?4 + ?5 ELSE 1000 END";

function schemeValues(body: z.infer<typeof schemeInput>) {
  return [body.name, body.kind, body.kind === "fixed" ? body.sets ?? null : null, body.kind === "free" ? null : body.reps ?? null] as const;
}

app.post("/schemes", async (c) => {
  const body = await parseBody(c.req.raw, schemeInput);
  if (body instanceof Response) return body;
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO scheme (id, name, kind, sets, reps, position) VALUES (?1, ?2, ?3, ?4, ?5, ${SCHEME_POSITION})`,
  ).bind(id, ...schemeValues(body)).run();
  return c.json({ id }, 201);
});

app.put("/schemes/:id", async (c) => {
  const body = await parseBody(c.req.raw, schemeInput);
  if (body instanceof Response) return body;
  const { meta } = await c.env.DB.prepare(`UPDATE scheme SET name = ?2, kind = ?3, sets = ?4, reps = ?5, position = ${SCHEME_POSITION} WHERE id = ?1`)
    .bind(c.req.param("id"), ...schemeValues(body)).run();
  return meta.changes ? c.body(null, 204) : c.json({ error: "Not found" }, 404);
});

app.delete("/schemes/:id", async (c) => {
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT 1 FROM log_entry WHERE scheme_id = ?1 LIMIT 1").bind(id).first();
  if (used) return c.json({ error: "This session type is used by logged sessions" }, 409);
  await c.env.DB.prepare("DELETE FROM scheme WHERE id = ?1").bind(id).run();
  return c.body(null, 204);
});

function setStatements(db: D1Database, entryId: string, sets: z.infer<typeof entryInput>["sets"]) {
  return sets.map((set, position) =>
    db.prepare("INSERT INTO log_set (id, log_entry_id, position, reps, weight_kg, success) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(crypto.randomUUID(), entryId, position, set.reps, set.weightKg, set.success ? 1 : 0),
  );
}

app.get("/entries/:id", async (c) => {
  const [entry] = await loadEntries(c.env.DB, "le.id", c.req.param("id"));
  return entry ? c.json(entry) : c.json({ error: "Not found" }, 404);
});

app.post("/entries", async (c) => {
  const body = await parseBody(c.req.raw, entryInput);
  if (body instanceof Response) return body;
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO log_entry (id, exercise_id, scheme_id, date, notes) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(id, body.exerciseId, body.schemeId, body.date, body.notes || null),
    ...setStatements(c.env.DB, id, body.sets),
  ]);
  return c.json({ id }, 201);
});

app.put("/entries/:id", async (c) => {
  const body = await parseBody(c.req.raw, entryInput);
  if (body instanceof Response) return body;
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT 1 FROM log_entry WHERE id = ?1").bind(id).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE log_entry SET exercise_id = ?2, scheme_id = ?3, date = ?4, notes = ?5 WHERE id = ?1")
      .bind(id, body.exerciseId, body.schemeId, body.date, body.notes || null),
    c.env.DB.prepare("DELETE FROM log_set WHERE log_entry_id = ?1").bind(id),
    ...setStatements(c.env.DB, id, body.sets),
  ]);
  return c.body(null, 204);
});

app.delete("/entries/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM log_entry WHERE id = ?1").bind(c.req.param("id")).run();
  return c.body(null, 204);
});

app.get("/export", async (c) => {
  const tables = ["movement", "exercise", "exercise_part", "scheme", "log_entry", "log_set"] as const;
  const results = await c.env.DB.batch(tables.map((table) => c.env.DB.prepare(`SELECT * FROM ${table}`)));
  const dump = Object.fromEntries(tables.map((table, index) => [table, results[index].results]));
  return c.json({ exportedAt: new Date().toISOString(), ...dump }, 200, {
    "Content-Disposition": `attachment; filename="lift-log-${new Date().toISOString().slice(0, 10)}.json"`,
  });
});

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
