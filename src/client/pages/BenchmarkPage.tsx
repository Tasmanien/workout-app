import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import type { BenchmarkDetail, BenchmarkMeasure } from "../../shared/types";
import { useBenchmark } from "../api";
import { Card, ErrorText, Loading, PageHeader } from "../components/ui";
import { ChipPicker, defaultPeriod, PeriodPicker, ProgressView, type PeriodKey, type Point } from "../components/Progress";
import { formatDate } from "../format";
import { formatImprovement, formatMeasureValue, isBetter, resultValue, totalMeasure } from "../measures";

const STANDARD_VARIANT = "Standard";

function variantOf(variant: string | null): string {
  return variant?.trim() || STANDARD_VARIANT;
}

function measurePoints(benchmark: BenchmarkDetail, measure: BenchmarkMeasure, variant: string): Point[] {
  const bestByDate = new Map<string, number>();
  for (const result of benchmark.results) {
    if (variantOf(result.variant) !== variant) continue;
    const value = resultValue(result, measure, benchmark.measures);
    if (value === undefined) continue;
    const current = bestByDate.get(result.date);
    if (current === undefined || isBetter(value, current, measure.better)) bestByDate.set(result.date, value);
  }
  return [...bestByDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

function sideGap(benchmark: BenchmarkDetail): { measures: [BenchmarkMeasure, BenchmarkMeasure] } | null {
  const [first, second] = benchmark.measures;
  if (benchmark.measures.length !== 2 || first.unit !== second.unit || first.unit === "rounds_reps") return null;
  return { measures: [first, second] };
}

function Progress({ benchmark }: { benchmark: BenchmarkDetail }) {
  const total = totalMeasure(benchmark.measures);
  const measures = useMemo(() => (total ? [total, ...benchmark.measures] : benchmark.measures), [benchmark.measures, total]);
  const variants = useMemo(
    () => [...new Set(benchmark.results.map((result) => variantOf(result.variant)))],
    [benchmark.results],
  );
  const [variant, setVariant] = useState(() => variantOf(benchmark.results[0]?.variant ?? null));
  const [measureId, setMeasureId] = useState(measures[0].id);
  const measure = measures.find((candidate) => candidate.id === measureId) ?? measures[0];
  const points = useMemo(() => measurePoints(benchmark, measure, variant), [benchmark, measure, variant]);
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(measurePoints(benchmark, measures[0], variant)));
  if (benchmark.results.length === 0) return null;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Progress</h2>
      {variants.length > 1 && <ChipPicker options={variants.map((key) => ({ key, label: key }))} value={variant} onChange={setVariant} />}
      {measures.length > 1 && <ChipPicker options={measures.map((candidate) => ({ key: candidate.id, label: candidate.name }))} value={measure.id} onChange={setMeasureId} />}
      <PeriodPicker value={period} onChange={setPeriod} />
      <ProgressView
        points={points}
        period={period}
        better={measure.better}
        format={(value) => formatMeasureValue(value, measure.unit)}
        formatChange={(delta) => formatImprovement(delta, measure.unit, measure.better)}
        emptyLabel="No result in this period."
      />
    </Card>
  );
}

export function BenchmarkPage() {
  const { benchmarkId = "" } = useParams();
  const { data: benchmark, isPending, error } = useBenchmark(benchmarkId);

  if (isPending) return <Loading />;
  if (!benchmark) return <div className="p-4"><ErrorText error={error ?? "Not found"} /></div>;

  const gap = sideGap(benchmark);
  const last = benchmark.results[0];

  return (
    <>
      <PageHeader
        title={benchmark.name}
        action={<Link to={`/benchmarks/${benchmark.id}/results/new`} className="shrink-0 rounded-xl bg-accent px-4 py-2 font-semibold text-zinc-950">Add result</Link>}
      />
      <div className="flex flex-col gap-3 px-4">
        <div className="flex items-center justify-between text-sm">
          <span className="rounded-md bg-zinc-800 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-zinc-400">{benchmark.category}</span>
          <Link to={`/benchmarks/${benchmark.id}/edit`} className="text-accent">Edit benchmark</Link>
        </div>
        {benchmark.protocol && (
          <Card>
            <h2 className="mb-2 font-semibold">Protocol</h2>
            <p className="whitespace-pre-wrap text-sm text-zinc-300">{benchmark.protocol}</p>
          </Card>
        )}
        {gap && last && last.values[gap.measures[0].id] !== undefined && last.values[gap.measures[1].id] !== undefined && (
          <Card>
            <h2 className="mb-2 font-semibold">Last result</h2>
            <div className="grid grid-cols-3 gap-2 text-center text-sm">
              {gap.measures.map((measure) => (
                <div key={measure.id} className="rounded-lg bg-zinc-800 px-2 py-2">
                  <div className="text-zinc-400">{measure.name}</div>
                  <div className="text-lg font-semibold">{formatMeasureValue(last.values[measure.id], measure.unit)}</div>
                </div>
              ))}
              <div className="rounded-lg bg-zinc-800 px-2 py-2">
                <div className="text-zinc-400">Gap</div>
                <div className="text-lg font-semibold">
                  {formatMeasureValue(Math.abs(last.values[gap.measures[0].id] - last.values[gap.measures[1].id]), gap.measures[0].unit)}
                </div>
              </div>
            </div>
          </Card>
        )}
        <Progress key={benchmark.id} benchmark={benchmark} />
        <h2 className="mt-2 font-semibold">History</h2>
        {benchmark.results.length === 0 && <p className="text-sm text-zinc-500">No result yet.</p>}
        {benchmark.results.map((result) => (
          <Link key={result.id} to={`/benchmarks/${benchmark.id}/results/${result.id}`} className="rounded-2xl bg-zinc-900 p-3 active:bg-zinc-800">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{variantOf(result.variant)}</span>
              <span className="text-zinc-500">{formatDate(result.date)}</span>
            </div>
            <p className="mt-1 text-zinc-300">
              {benchmark.measures
                .filter((measure) => result.values[measure.id] !== undefined)
                .map((measure) => `${benchmark.measures.length > 1 ? `${measure.name} ` : ""}${formatMeasureValue(result.values[measure.id], measure.unit)}`)
                .join(" · ")}
            </p>
            {result.notes && <p className="mt-1 text-sm text-zinc-500">{result.notes}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
