import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import type { BenchmarkMeasure } from "../../shared/types";
import { useBenchmark, useDeleteBenchmarkResult, useSaveBenchmarkResult } from "../api";
import { Button, ErrorText, Input, Label, Loading, PageHeader } from "../components/ui";
import { todayIso } from "../format";
import { decodeRoundsReps, encodeRoundsReps, formatDuration, parseDuration } from "../measures";

type Draft = Record<string, { main: string; extra: string }>;

const DEFAULT_VARIANTS = ["Rx", "Scaled"];

function draftFor(measure: BenchmarkMeasure, value: number | undefined): { main: string; extra: string } {
  if (value === undefined) return { main: "", extra: "" };
  if (measure.unit === "time") return { main: formatDuration(value), extra: "" };
  if (measure.unit === "rounds_reps") {
    const { rounds, reps } = decodeRoundsReps(value);
    return { main: String(rounds), extra: String(reps) };
  }
  return { main: String(value), extra: "" };
}

function parseDraft(measure: BenchmarkMeasure, draft: { main: string; extra: string } | undefined): number | null | undefined {
  if (!draft || (!draft.main.trim() && !draft.extra.trim())) return undefined;
  if (measure.unit === "time") return parseDuration(draft.main);
  const main = Number(draft.main.replace(",", ".") || "0");
  if (measure.unit === "rounds_reps") {
    const extra = Number(draft.extra || "0");
    return Number.isInteger(main) && Number.isInteger(extra) && main >= 0 && extra >= 0 && extra < 1000 ? encodeRoundsReps(main, extra) : null;
  }
  return Number.isFinite(main) && main >= 0 ? main : null;
}

const UNIT_PLACEHOLDER: Record<string, string> = { reps: "reps", cal: "cal", cm: "cm", deg: "°", kg: "kg", m: "m" };

export function BenchmarkResultPage() {
  const { benchmarkId = "", resultId } = useParams();
  const navigate = useNavigate();
  const { data: benchmark, isPending, error } = useBenchmark(benchmarkId);
  const saveResult = useSaveBenchmarkResult();
  const deleteResult = useDeleteBenchmarkResult();

  const [date, setDate] = useState(todayIso());
  const [variant, setVariant] = useState("");
  const [notes, setNotes] = useState("");
  const [draft, setDraft] = useState<Draft>({});
  const [loaded, setLoaded] = useState(false);

  const existing = benchmark?.results.find((result) => result.id === resultId);

  useEffect(() => {
    if (!benchmark || loaded) return;
    if (existing) {
      setDate(existing.date);
      setVariant(existing.variant ?? "");
      setNotes(existing.notes ?? "");
      setDraft(Object.fromEntries(benchmark.measures.map((measure) => [measure.id, draftFor(measure, existing.values[measure.id])])));
    } else {
      setVariant(benchmark.results[0]?.variant ?? "");
    }
    setLoaded(true);
  }, [benchmark, existing, loaded]);

  const variants = useMemo(
    () => [...new Set([...DEFAULT_VARIANTS, ...(benchmark?.results ?? []).map((result) => result.variant).filter((value): value is string => !!value)])],
    [benchmark],
  );

  if (isPending) return <Loading />;
  if (!benchmark) return <div className="p-4"><ErrorText error={error ?? "Not found"} /></div>;

  const parsed = benchmark.measures.map((measure) => ({ measure, value: parseDraft(measure, draft[measure.id]) }));
  const invalid = parsed.some(({ value }) => value === null);
  const values = parsed.filter(({ value }) => typeof value === "number").map(({ measure, value }) => ({ measureId: measure.id, value: value as number }));
  const canSave = !!date && !invalid && values.length > 0 && !saveResult.isPending;

  const update = (measureId: string, patch: Partial<{ main: string; extra: string }>) =>
    setDraft((current) => ({ ...current, [measureId]: { ...(current[measureId] ?? { main: "", extra: "" }), ...patch } }));

  const save = async () => {
    await saveResult.mutateAsync({ id: resultId, input: { benchmarkId, date, variant: variant.trim() || null, notes: notes.trim() || null, values } });
    navigate(`/benchmarks/${benchmarkId}`, { replace: true });
  };

  const remove = async () => {
    if (!resultId || !window.confirm("Delete this result?")) return;
    await deleteResult.mutateAsync(resultId);
    navigate(`/benchmarks/${benchmarkId}`, { replace: true });
  };

  return (
    <>
      <PageHeader title={benchmark.name} />
      <div className="flex flex-col gap-4 px-4">
        <div className="grid grid-cols-2 gap-3">
          <Label title="Date">
            <Input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} />
          </Label>
          <Label title="Version">
            <Input list="benchmark-variants" placeholder="Rx, Scaled, vest…" value={variant} onChange={(event) => setVariant(event.target.value)} />
            <datalist id="benchmark-variants">
              {variants.map((candidate) => <option key={candidate} value={candidate} />)}
            </datalist>
          </Label>
        </div>

        {benchmark.measures.map((measure) => (
          <Label key={measure.id} title={measure.name}>
            {measure.unit === "time" && (
              <Input inputMode="numeric" placeholder="mm:ss or h:mm:ss" value={draft[measure.id]?.main ?? ""} onChange={(event) => update(measure.id, { main: event.target.value })} />
            )}
            {measure.unit === "rounds_reps" && (
              <div className="grid grid-cols-2 gap-2">
                <Input inputMode="numeric" placeholder="rounds" value={draft[measure.id]?.main ?? ""} onChange={(event) => update(measure.id, { main: event.target.value })} />
                <Input inputMode="numeric" placeholder="+ reps" value={draft[measure.id]?.extra ?? ""} onChange={(event) => update(measure.id, { extra: event.target.value })} />
              </div>
            )}
            {measure.unit !== "time" && measure.unit !== "rounds_reps" && (
              <Input inputMode="decimal" placeholder={UNIT_PLACEHOLDER[measure.unit]} value={draft[measure.id]?.main ?? ""} onChange={(event) => update(measure.id, { main: event.target.value })} />
            )}
          </Label>
        ))}

        <Label title="Notes">
          <textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-accent" />
        </Label>

        {invalid && <ErrorText error="A value is not valid (time as mm:ss or h:mm:ss, numbers ≥ 0)." />}
        <ErrorText error={saveResult.error ?? deleteResult.error} />
        <Button variant="primary" disabled={!canSave} onClick={save}>{saveResult.isPending ? "Saving…" : "Save"}</Button>
        {resultId && <Button variant="danger" onClick={remove}>Delete result</Button>}
      </div>
    </>
  );
}
