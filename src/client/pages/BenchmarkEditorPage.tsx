import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { MeasureBetter, MeasureUnit } from "../../shared/schemas";
import { useBenchmark, useBenchmarks, useDeleteBenchmark, useSaveBenchmark } from "../api";
import { Button, Card, ErrorText, Input, Label, Loading, PageHeader, Select } from "../components/ui";
import { defaultBetter, UNIT_LABELS } from "../measures";

interface MeasureRow {
  id?: string;
  name: string;
  unit: MeasureUnit;
  better: MeasureBetter;
}

const DEFAULT_CATEGORIES = ["Mobility", "CrossFit", "Hyrox"];

const TEMPLATES: { label: string; measures: MeasureRow[] }[] = [
  { label: "For time", measures: [{ name: "Time", unit: "time", better: "lower" }] },
  { label: "AMRAP", measures: [{ name: "Score", unit: "rounds_reps", better: "higher" }] },
  { label: "Left / Right", measures: [{ name: "Left", unit: "cm", better: "higher" }, { name: "Right", unit: "cm", better: "higher" }] },
];

const textAreaStyles = "w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-accent";

export function BenchmarkEditorPage() {
  const { benchmarkId } = useParams();
  const navigate = useNavigate();
  const { data: benchmark, isPending, error } = useBenchmark(benchmarkId);
  const { data: benchmarks } = useBenchmarks();
  const saveBenchmark = useSaveBenchmark();
  const deleteBenchmark = useDeleteBenchmark();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [protocol, setProtocol] = useState("");
  const [archived, setArchived] = useState(false);
  const [measures, setMeasures] = useState<MeasureRow[]>(TEMPLATES[0].measures);
  const [loadedId, setLoadedId] = useState<string>();

  useEffect(() => {
    if (!benchmark || loadedId === benchmark.id) return;
    setName(benchmark.name);
    setCategory(benchmark.category);
    setProtocol(benchmark.protocol ?? "");
    setArchived(benchmark.archived);
    setMeasures(benchmark.measures.map(({ id, name: measureName, unit, better }) => ({ id, name: measureName, unit, better })));
    setLoadedId(benchmark.id);
  }, [benchmark, loadedId]);

  const categories = useMemo(
    () => [...new Set([...DEFAULT_CATEGORIES, ...(benchmarks ?? []).map((candidate) => candidate.category)])].sort((a, b) => a.localeCompare(b)),
    [benchmarks],
  );

  const updateMeasure = (index: number, patch: Partial<MeasureRow>) =>
    setMeasures((current) => current.map((measure, i) => (i === index ? { ...measure, ...patch } : measure)));

  const valid = !!name.trim() && !!category.trim() && measures.length > 0 && measures.every((measure) => measure.name.trim());

  const save = async () => {
    const saved = await saveBenchmark.mutateAsync({
      id: benchmarkId,
      input: { name: name.trim(), category: category.trim(), protocol: protocol.trim() || null, archived, measures },
    });
    navigate(`/benchmarks/${benchmarkId ?? saved?.id}`, { replace: true });
  };

  const remove = async () => {
    if (!benchmarkId || !window.confirm(`Delete ${name}?`)) return;
    await deleteBenchmark.mutateAsync(benchmarkId);
    navigate("/benchmarks", { replace: true });
  };

  if (benchmarkId && isPending) return <Loading />;
  if (benchmarkId && error) return <div className="p-4"><ErrorText error={error} /></div>;
  const hasResults = (benchmark?.resultCount ?? 0) > 0;

  return (
    <>
      <PageHeader title={benchmarkId ? "Edit benchmark" : "New benchmark"} />
      <div className="flex flex-col gap-4 px-4">
        <Label title="Name">
          <Input placeholder="e.g. Murph, Ankle knee-to-wall" value={name} onChange={(event) => setName(event.target.value)} />
        </Label>
        <Label title="Category">
          <Input list="benchmark-categories" placeholder="Mobility, CrossFit, Hyrox…" value={category} onChange={(event) => setCategory(event.target.value)} />
          <datalist id="benchmark-categories">
            {categories.map((candidate) => <option key={candidate} value={candidate} />)}
          </datalist>
        </Label>
        <Label title="Protocol (how to repeat it exactly)">
          <textarea rows={5} className={textAreaStyles} value={protocol} onChange={(event) => setProtocol(event.target.value)} />
        </Label>

        <Card className="flex flex-col gap-3 p-3">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">What you measure</h2>
            {!hasResults && (
              <div className="flex gap-1">
                {TEMPLATES.map((template) => (
                  <button key={template.label} type="button" onClick={() => setMeasures(template.measures)} className="rounded-lg bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
                    {template.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          {measures.map((measure, index) => (
            <div key={measure.id ?? index} className="flex flex-col gap-2 rounded-xl bg-zinc-950/60 p-2">
              <div className="flex gap-2">
                <Input aria-label="Measure name" placeholder="e.g. Time, Left, Wall balls" value={measure.name} onChange={(event) => updateMeasure(index, { name: event.target.value })} />
                <button
                  type="button"
                  aria-label="Remove measure"
                  disabled={measures.length === 1}
                  onClick={() => setMeasures((current) => current.filter((_, i) => i !== index))}
                  className="w-10 shrink-0 text-zinc-500 disabled:opacity-30"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Select aria-label="Unit" value={measure.unit} onChange={(event) => {
                  const unit = event.target.value as MeasureUnit;
                  updateMeasure(index, { unit, better: defaultBetter(unit) });
                }}>
                  {(Object.keys(UNIT_LABELS) as MeasureUnit[]).map((unit) => <option key={unit} value={unit}>{UNIT_LABELS[unit]}</option>)}
                </Select>
                <Select aria-label="Better" value={measure.better} onChange={(event) => updateMeasure(index, { better: event.target.value as MeasureBetter })}>
                  <option value="higher">Higher is better</option>
                  <option value="lower">Lower is better</option>
                </Select>
              </div>
            </div>
          ))}
          <Button onClick={() => setMeasures((current) => [...current, { name: "", unit: current.at(-1)?.unit ?? "reps", better: current.at(-1)?.better ?? "higher" }])}>
            + Measure
          </Button>
          <p className="text-xs text-zinc-500">Several measures in reps or cal (e.g. one per station) also get a Total.</p>
        </Card>

        {benchmarkId && (
          <label className="flex items-center gap-3 text-zinc-300">
            <input type="checkbox" className="size-5 accent-amber-400" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
            Archived (hidden from the list)
          </label>
        )}
        <ErrorText error={saveBenchmark.error ?? deleteBenchmark.error} />
        <Button variant="primary" disabled={!valid || saveBenchmark.isPending} onClick={save}>{saveBenchmark.isPending ? "Saving…" : "Save"}</Button>
        {benchmarkId && !hasResults && <Button variant="danger" onClick={remove}>Delete benchmark</Button>}
      </div>
    </>
  );
}
