import { Link } from "react-router";
import type { BenchmarkSummary } from "../../shared/types";
import { useBenchmarks } from "../api";
import { ErrorText, Loading, PageHeader } from "../components/ui";
import { formatDate } from "../format";
import { formatMeasureValue, resultValue, totalMeasure } from "../measures";

const SUMMARY_MEASURES = 3;

function lastResultSummary(benchmark: BenchmarkSummary): string {
  const result = benchmark.lastResult;
  if (!result) return "No result yet";
  const total = totalMeasure(benchmark.measures);
  if (total) {
    const value = resultValue(result, total, benchmark.measures);
    if (value !== undefined) return `Total ${formatMeasureValue(value, total.unit)}`;
  }
  const parts = benchmark.measures
    .filter((measure) => result.values[measure.id] !== undefined)
    .map((measure) => {
      const value = formatMeasureValue(result.values[measure.id], measure.unit);
      return benchmark.measures.length > 1 ? `${measure.name} ${value}` : value;
    });
  const shown = parts.slice(0, SUMMARY_MEASURES).join(" · ");
  return parts.length > SUMMARY_MEASURES ? `${shown} …` : shown;
}

export function BenchmarksPage() {
  const { data: benchmarks, isPending, error } = useBenchmarks();
  const visible = (benchmarks ?? []).filter((benchmark) => !benchmark.archived);
  const categories = [...new Set(visible.map((benchmark) => benchmark.category))].sort((a, b) => a.localeCompare(b));

  return (
    <>
      <PageHeader
        title="Benchmarks"
        action={<Link to="/benchmarks/new" className="shrink-0 rounded-xl bg-zinc-800 px-4 py-2 text-sm">+ New</Link>}
      />
      <div className="flex flex-col gap-3 px-4">
        <ErrorText error={error} />
        {isPending && <Loading />}
        {benchmarks && visible.length === 0 && (
          <p className="py-8 text-center text-zinc-500">
            No benchmark yet: mobility tests, Murph, your own Hyrox WODs… <Link to="/benchmarks/new" className="text-accent">Create one</Link>.
          </p>
        )}
        {categories.map((category) => (
          <section key={category} className="flex flex-col gap-3">
            <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{category}</h2>
            {visible
              .filter((benchmark) => benchmark.category === category)
              .map((benchmark) => (
                <Link key={benchmark.id} to={`/benchmarks/${benchmark.id}`} className="rounded-2xl bg-zinc-900 p-4 active:bg-zinc-800">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="font-semibold">{benchmark.name}</h3>
                    {benchmark.lastResult && <span className="shrink-0 text-xs text-zinc-500">{formatDate(benchmark.lastResult.date)}</span>}
                  </div>
                  <p className={`mt-1 text-sm ${benchmark.lastResult ? "text-zinc-300" : "text-zinc-500"}`}>{lastResultSummary(benchmark)}</p>
                </Link>
              ))}
          </section>
        ))}
      </div>
    </>
  );
}
