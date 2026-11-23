import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { entryResultKg, schemeCovers, type RecordScheme } from "../../shared/records";
import type { Entry, ExerciseDetail, Scheme } from "../../shared/types";
import { useExercise, useSchemes } from "../api";
import { Card, ErrorText, Input, Loading, PageHeader, Select } from "../components/ui";
import { ChipPicker, defaultPeriod, PeriodPicker, ProgressView, type PeriodKey, type Point } from "../components/Progress";
import { formatDate, formatKg, roundTo, summarizeSets } from "../format";

const PERCENTAGES = [50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100];
const ROUNDING_KEY = "lift-log:rounding";

function PercentCalculator({ defaultBase }: { defaultBase: number | undefined }) {
  const [base, setBase] = useState(defaultBase ? String(defaultBase) : "");
  const [step, setStep] = useState(() => localStorage.getItem(ROUNDING_KEY) ?? "1");
  const baseKg = Number(base.replace(",", "."));

  return (
    <Card>
      <h2 className="mb-3 font-semibold">% calculator</h2>
      <div className="mb-3 flex gap-2">
        <Input inputMode="decimal" placeholder="Base kg" value={base} onChange={(event) => setBase(event.target.value)} />
        <Select
          className="w-28"
          value={step}
          onChange={(event) => {
            setStep(event.target.value);
            localStorage.setItem(ROUNDING_KEY, event.target.value);
          }}
        >
          <option value="0.5">± 0.5</option>
          <option value="1">± 1</option>
          <option value="2.5">± 2.5</option>
        </Select>
      </div>
      {baseKg > 0 && (
        <div className="grid grid-cols-3 gap-2 text-sm">
          {PERCENTAGES.map((percent) => (
            <div key={percent} className="rounded-lg bg-zinc-800 px-2 py-1.5 text-center">
              <span className="text-zinc-400">{percent}%</span>{" "}
              <span className="font-semibold">{formatKg(roundTo((baseKg * percent) / 100, Number(step)))}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function toRecordScheme(scheme: Scheme): RecordScheme {
  return { ...scheme, position: 0 };
}

function progressPoints(entries: Entry[], schemeById: Map<string, Scheme>, target: Scheme): Point[] {
  const bestByDate = new Map<string, number>();
  for (const entry of entries) {
    const scheme = schemeById.get(entry.schemeId);
    if (!scheme || !schemeCovers(toRecordScheme(scheme), toRecordScheme(target))) continue;
    const weightKg = entryResultKg({ date: entry.date, scheme: toRecordScheme(scheme), sets: entry.sets });
    if (weightKg === null || weightKg <= 0) continue;
    bestByDate.set(entry.date, Math.max(bestByDate.get(entry.date) ?? 0, weightKg));
  }
  return [...bestByDate.entries()].map(([date, value]) => ({ date, value })).sort((a, b) => a.date.localeCompare(b.date));
}

function signedKg(deltaKg: number): string {
  if (deltaKg === 0) return "±0 kg";
  return `${deltaKg > 0 ? "+" : "−"}${formatKg(Math.abs(deltaKg))} kg`;
}

function Progress({ exercise, schemes }: { exercise: ExerciseDetail; schemes: Scheme[] }) {
  const schemeById = useMemo(() => new Map(schemes.map((scheme) => [scheme.id, scheme])), [schemes]);
  const series = useMemo(
    () =>
      schemes
        .filter((scheme) => !scheme.hidden && scheme.kind !== "free")
        .map((scheme) => ({ scheme, points: progressPoints(exercise.entries, schemeById, scheme) }))
        .filter(({ points }) => points.length > 0),
    [exercise.entries, schemeById, schemes],
  );
  const [selectedId, setSelectedId] = useState<string>();
  const [period, setPeriod] = useState<PeriodKey>(() => defaultPeriod(series[0]?.points ?? []));
  const selected = series.find(({ scheme }) => scheme.id === selectedId) ?? series[0];
  if (!selected) return null;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Progress</h2>
      <ChipPicker
        options={series.map(({ scheme }) => ({ key: scheme.id, label: scheme.name }))}
        value={selected.scheme.id}
        onChange={setSelectedId}
      />
      <PeriodPicker value={period} onChange={setPeriod} />
      <ProgressView
        points={selected.points}
        period={period}
        better="higher"
        format={(value) => `${formatKg(value)} kg`}
        formatChange={signedKg}
        emptyLabel={`No ${selected.scheme.name} in this period.`}
      />
    </Card>
  );
}

export function ExercisePage() {
  const { exerciseId = "" } = useParams();
  const { data: exercise, isPending, error } = useExercise(exerciseId);
  const { data: schemes } = useSchemes();

  if (isPending) return <Loading />;
  if (!exercise) return <div className="p-4"><ErrorText error={error ?? "Not found"} /></div>;

  const isComplex = exercise.parts.length > 1;
  const oneRepMax = exercise.records.find((record) => schemes?.find((scheme) => scheme.id === record.schemeId && scheme.kind === "max" && scheme.reps === 1));

  return (
    <>
      <PageHeader
        title={exercise.displayName}
        action={<Link to={`/log?exercise=${exercise.id}`} className="shrink-0 rounded-xl bg-accent px-4 py-2 font-semibold text-zinc-950">Log</Link>}
      />
      <div className="flex flex-col gap-3 px-4">
        {isComplex && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded-md bg-violet-500/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-violet-300">Complex</span>
            <span className="text-zinc-400">{exercise.parts.map((part) => `${part.reps} ${part.movementName}`).join(" + ")}</span>
          </div>
        )}
        <Card>
          <h2 className="mb-2 font-semibold">Records</h2>
          {exercise.records.length === 0 && <p className="text-sm text-zinc-500">No record yet. Log a max or a sets × reps session.</p>}
          <ul className="divide-y divide-zinc-800">
            {exercise.records.map((record) => (
              <li key={record.schemeId} className="flex items-baseline justify-between py-2">
                <span className="text-zinc-300">{record.schemeName}</span>
                <span>
                  <span className="text-lg font-semibold text-accent">{formatKg(record.weightKg)}</span>
                  <span className="text-sm text-zinc-500"> kg · {formatDate(record.date)}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
        {schemes && <Progress key={exercise.id} exercise={exercise} schemes={schemes} />}
        <PercentCalculator key={oneRepMax?.weightKg} defaultBase={oneRepMax?.weightKg} />
        <h2 className="mt-2 font-semibold">History</h2>
        {exercise.entries.length === 0 && <p className="text-sm text-zinc-500">Nothing logged yet.</p>}
        {exercise.entries.map((entry) => (
          <Link key={entry.id} to={`/log/${entry.id}`} className="rounded-2xl bg-zinc-900 p-3 active:bg-zinc-800">
            <div className="flex justify-between text-sm">
              <span className="font-medium">{entry.schemeName}</span>
              <span className="text-zinc-500">{formatDate(entry.date)}{entry.source === "jefit" && " · JEFIT"}</span>
            </div>
            <p className="mt-1 text-zinc-300">{summarizeSets(entry.sets)}</p>
            {entry.notes && <p className="mt-1 text-sm text-zinc-500">{entry.notes}</p>}
          </Link>
        ))}
      </div>
    </>
  );
}
