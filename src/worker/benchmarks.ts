import { Hono } from "hono";
import { benchmarkInput, benchmarkResultInput } from "../shared/schemas";
import type { BenchmarkDetail, BenchmarkMeasure, BenchmarkResult, BenchmarkSummary } from "../shared/types";
import { parseBody } from "./http";

export const benchmarks = new Hono<{ Bindings: Env }>();

interface BenchmarkRow { id: string; name: string; category: string; protocol: string | null; archived: number }
interface MeasureRow extends BenchmarkMeasure { benchmark_id: string }
interface ResultRow { id: string; benchmark_id: string; date: string; variant: string | null; notes: string | null }
interface ValueRow { result_id: string; measure_id: string; value: number }

async function loadBenchmarks(db: D1Database, benchmarkId?: string, allResults = false) {
  const filter = benchmarkId ? "WHERE b.id = ?1" : "";
  const bind = (statement: D1PreparedStatement) => (benchmarkId ? statement.bind(benchmarkId) : statement);
  const resultFilter = allResults
    ? ""
    : `AND r.id = (SELECT r2.id FROM benchmark_result r2 WHERE r2.benchmark_id = r.benchmark_id ORDER BY r2.date DESC, r2.created_at DESC LIMIT 1)`;
  const [benchmarkRows, measureRows, resultRows, valueRows, countRows] = await db.batch([
    bind(db.prepare(`SELECT b.id, b.name, b.category, b.protocol, b.archived FROM benchmark b ${filter} ORDER BY b.name COLLATE NOCASE`)),
    bind(db.prepare(
      `SELECT m.id, m.benchmark_id, m.name, m.unit, m.better FROM benchmark_measure m JOIN benchmark b ON b.id = m.benchmark_id ${filter} ORDER BY m.position`,
    )),
    bind(db.prepare(
      `SELECT r.id, r.benchmark_id, r.date, r.variant, r.notes FROM benchmark_result r JOIN benchmark b ON b.id = r.benchmark_id
       ${filter || "WHERE 1 = 1"} ${resultFilter} ORDER BY r.date DESC, r.created_at DESC`,
    )),
    bind(db.prepare(
      `SELECT v.result_id, v.measure_id, v.value FROM benchmark_value v JOIN benchmark_result r ON r.id = v.result_id JOIN benchmark b ON b.id = r.benchmark_id
       ${filter || "WHERE 1 = 1"} ${resultFilter}`,
    )),
    bind(db.prepare(`SELECT r.benchmark_id, COUNT(*) AS n FROM benchmark_result r JOIN benchmark b ON b.id = r.benchmark_id ${filter} GROUP BY r.benchmark_id`)),
  ]);

  const valuesByResult = new Map<string, Record<string, number>>();
  for (const row of valueRows.results as unknown as ValueRow[]) {
    const values = valuesByResult.get(row.result_id) ?? {};
    values[row.measure_id] = row.value;
    valuesByResult.set(row.result_id, values);
  }
  const resultsByBenchmark = new Map<string, BenchmarkResult[]>();
  for (const row of resultRows.results as unknown as ResultRow[]) {
    const list = resultsByBenchmark.get(row.benchmark_id) ?? [];
    list.push({ id: row.id, date: row.date, variant: row.variant, notes: row.notes, values: valuesByResult.get(row.id) ?? {} });
    resultsByBenchmark.set(row.benchmark_id, list);
  }
  const measuresByBenchmark = new Map<string, BenchmarkMeasure[]>();
  for (const { benchmark_id, ...measure } of measureRows.results as unknown as MeasureRow[]) {
    const list = measuresByBenchmark.get(benchmark_id) ?? [];
    list.push(measure);
    measuresByBenchmark.set(benchmark_id, list);
  }
  const counts = new Map((countRows.results as unknown as { benchmark_id: string; n: number }[]).map((row) => [row.benchmark_id, row.n]));

  return (benchmarkRows.results as unknown as BenchmarkRow[]).map((row) => {
    const results = resultsByBenchmark.get(row.id) ?? [];
    const summary: BenchmarkSummary = {
      id: row.id,
      name: row.name,
      category: row.category,
      protocol: row.protocol,
      archived: row.archived === 1,
      measures: measuresByBenchmark.get(row.id) ?? [],
      resultCount: counts.get(row.id) ?? 0,
      lastResult: results[0] ?? null,
    };
    return { summary, results };
  });
}

benchmarks.get("/benchmarks", async (c) => c.json((await loadBenchmarks(c.env.DB)).map(({ summary }) => summary)));

benchmarks.get("/benchmarks/:id", async (c) => {
  const [loaded] = await loadBenchmarks(c.env.DB, c.req.param("id"), true);
  if (!loaded) return c.json({ error: "Not found" }, 404);
  const detail: BenchmarkDetail = { ...loaded.summary, results: loaded.results };
  return c.json(detail);
});

benchmarks.post("/benchmarks", async (c) => {
  const body = await parseBody(c.req.raw, benchmarkInput);
  if (body instanceof Response) return body;
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO benchmark (id, name, category, protocol, archived) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(id, body.name, body.category, body.protocol || null, body.archived ? 1 : 0),
    ...body.measures.map((measure, position) =>
      c.env.DB.prepare("INSERT INTO benchmark_measure (id, benchmark_id, position, name, unit, better) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
        .bind(crypto.randomUUID(), id, position, measure.name, measure.unit, measure.better),
    ),
  ]);
  return c.json({ id }, 201);
});

benchmarks.put("/benchmarks/:id", async (c) => {
  const body = await parseBody(c.req.raw, benchmarkInput);
  if (body instanceof Response) return body;
  const id = c.req.param("id");
  const existing = await c.env.DB.prepare(
    `SELECT m.id, EXISTS (SELECT 1 FROM benchmark_value v WHERE v.measure_id = m.id) AS used FROM benchmark_measure m WHERE m.benchmark_id = ?1`,
  ).bind(id).all<{ id: string; used: number }>();
  const exists = await c.env.DB.prepare("SELECT 1 FROM benchmark WHERE id = ?1").bind(id).first();
  if (!exists) return c.json({ error: "Not found" }, 404);

  const keptIds = new Set(body.measures.map((measure) => measure.id).filter(Boolean));
  const removed = existing.results.filter((measure) => !keptIds.has(measure.id));
  if (removed.some((measure) => measure.used)) return c.json({ error: "A removed measure has results; keep it or delete those results first" }, 409);
  const knownIds = new Set(existing.results.map((measure) => measure.id));

  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE benchmark SET name = ?2, category = ?3, protocol = ?4, archived = ?5 WHERE id = ?1")
      .bind(id, body.name, body.category, body.protocol || null, body.archived ? 1 : 0),
    ...removed.map((measure) => c.env.DB.prepare("DELETE FROM benchmark_measure WHERE id = ?1").bind(measure.id)),
    ...body.measures.map((measure, position) =>
      measure.id && knownIds.has(measure.id)
        ? c.env.DB.prepare("UPDATE benchmark_measure SET position = ?2, name = ?3, unit = ?4, better = ?5 WHERE id = ?1")
          .bind(measure.id, position, measure.name, measure.unit, measure.better)
        : c.env.DB.prepare("INSERT INTO benchmark_measure (id, benchmark_id, position, name, unit, better) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
          .bind(crypto.randomUUID(), id, position, measure.name, measure.unit, measure.better),
    ),
  ]);
  return c.body(null, 204);
});

benchmarks.delete("/benchmarks/:id", async (c) => {
  const id = c.req.param("id");
  const used = await c.env.DB.prepare("SELECT 1 FROM benchmark_result WHERE benchmark_id = ?1 LIMIT 1").bind(id).first();
  if (used) return c.json({ error: "This benchmark has results; archive it instead" }, 409);
  await c.env.DB.prepare("DELETE FROM benchmark WHERE id = ?1").bind(id).run();
  return c.body(null, 204);
});

async function validMeasureIds(db: D1Database, benchmarkId: string): Promise<Set<string>> {
  const { results } = await db.prepare("SELECT id FROM benchmark_measure WHERE benchmark_id = ?1").bind(benchmarkId).all<{ id: string }>();
  return new Set(results.map((row) => row.id));
}

function valueStatements(db: D1Database, resultId: string, values: { measureId: string; value: number }[]) {
  return values.map((entry) =>
    db.prepare("INSERT INTO benchmark_value (result_id, measure_id, value) VALUES (?1, ?2, ?3)").bind(resultId, entry.measureId, entry.value),
  );
}

benchmarks.post("/benchmark-results", async (c) => {
  const body = await parseBody(c.req.raw, benchmarkResultInput);
  if (body instanceof Response) return body;
  const measureIds = await validMeasureIds(c.env.DB, body.benchmarkId);
  if (body.values.some((entry) => !measureIds.has(entry.measureId))) return c.json({ error: "Unknown measure" }, 400);
  const id = crypto.randomUUID();
  await c.env.DB.batch([
    c.env.DB.prepare("INSERT INTO benchmark_result (id, benchmark_id, date, variant, notes) VALUES (?1, ?2, ?3, ?4, ?5)")
      .bind(id, body.benchmarkId, body.date, body.variant || null, body.notes || null),
    ...valueStatements(c.env.DB, id, body.values),
  ]);
  return c.json({ id }, 201);
});

benchmarks.put("/benchmark-results/:id", async (c) => {
  const body = await parseBody(c.req.raw, benchmarkResultInput);
  if (body instanceof Response) return body;
  const id = c.req.param("id");
  const exists = await c.env.DB.prepare("SELECT 1 FROM benchmark_result WHERE id = ?1 AND benchmark_id = ?2").bind(id, body.benchmarkId).first();
  if (!exists) return c.json({ error: "Not found" }, 404);
  const measureIds = await validMeasureIds(c.env.DB, body.benchmarkId);
  if (body.values.some((entry) => !measureIds.has(entry.measureId))) return c.json({ error: "Unknown measure" }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE benchmark_result SET date = ?2, variant = ?3, notes = ?4 WHERE id = ?1")
      .bind(id, body.date, body.variant || null, body.notes || null),
    c.env.DB.prepare("DELETE FROM benchmark_value WHERE result_id = ?1").bind(id),
    ...valueStatements(c.env.DB, id, body.values),
  ]);
  return c.body(null, 204);
});

benchmarks.delete("/benchmark-results/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM benchmark_result WHERE id = ?1").bind(c.req.param("id")).run();
  return c.body(null, 204);
});
