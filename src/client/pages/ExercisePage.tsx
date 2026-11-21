import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { entryResultKg, schemeCovers, type RecordScheme } from "../../shared/records";
import type { Entry, ExerciseDetail, Scheme } from "../../shared/types";
import { useExercise, useSchemes } from "../api";
import { Card, ErrorText, Input, Loading, PageHeader, Select } from "../components/ui";
import { formatDate, formatKg, roundTo, summarizeSets, todayIso } from "../format";

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

interface Point {
  date: string;
  weightKg: number;
}

const PERIODS = [
  { key: "1M", label: "1M", months: 1 },
  { key: "6M", label: "6M", months: 6 },
  { key: "1Y", label: "1Y", months: 12 },
  { key: "all", label: "All", months: null },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function periodStart(months: number | null): string | null {
  if (months === null) return null;
  const start = new Date();
  start.setMonth(start.getMonth() - months);
  return start.toISOString().slice(0, 10);
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
  return [...bestByDate.entries()].map(([date, weightKg]) => ({ date, weightKg })).sort((a, b) => a.date.localeCompare(b.date));
}

function ProgressChart({ points, from, bestBefore }: { points: Point[]; from: string | null; bestBefore: number }) {
  const width = 320;
  const height = 150;
  const padLeft = 34;
  const startDate = from ?? points[0].date;
  const endDate = from ? todayIso() : points.at(-1)!.date;
  const startTime = new Date(startDate).getTime();
  const endTime = new Date(endDate).getTime();
  const weights = [...points.map((point) => point.weightKg), ...(bestBefore > 0 ? [bestBefore] : [])];
  const [minWeight, maxWeight] = [Math.min(...weights), Math.max(...weights)];
  const x = (date: string) => padLeft + ((new Date(date).getTime() - startTime) / (endTime - startTime || 1)) * (width - padLeft - 8);
  const y = (weight: number) => height - 14 - ((weight - minWeight) / (maxWeight - minWeight || 1)) * (height - 28);

  let best = bestBefore;
  const recordDates = new Set<string>();
  const steps: string[] = best > 0 ? [`M${x(startDate).toFixed(1)},${y(best).toFixed(1)}`] : [];
  for (const point of points) {
    if (point.weightKg <= best) continue;
    recordDates.add(point.date);
    steps.push(steps.length ? `L${x(point.date).toFixed(1)},${y(best).toFixed(1)}` : `M${x(point.date).toFixed(1)},${y(point.weightKg).toFixed(1)}`);
    steps.push(`L${x(point.date).toFixed(1)},${y(point.weightKg).toFixed(1)}`);
    best = point.weightKg;
  }
  steps.push(`L${x(endDate).toFixed(1)},${y(best).toFixed(1)}`);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Record progression">
      {[maxWeight, minWeight].map((weight) => (
        <g key={weight}>
          <line x1={padLeft} x2={width - 8} y1={y(weight)} y2={y(weight)} stroke="#27272a" strokeWidth={1} />
          <text x={padLeft - 6} y={y(weight) + 4} textAnchor="end" fontSize={11} fill="#71717a">{formatKg(weight)}</text>
        </g>
      ))}
      <path d={steps.join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
      {points.map((point) => (
        <circle
          key={point.date}
          cx={x(point.date)}
          cy={y(point.weightKg)}
          r={recordDates.has(point.date) ? 4 : 3}
          fill={recordDates.has(point.date) ? "var(--color-accent)" : "#52525b"}
        />
      ))}
    </svg>
  );
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
  const selected = series.find(({ scheme }) => scheme.id === selectedId) ?? series[0];
  const [periodKey, setPeriodKey] = useState<PeriodKey>(() => {
    const first = series[0]?.points ?? [];
    return first.filter((point) => point.date >= periodStart(12)!).length >= 2 ? "1Y" : "all";
  });
  if (!selected) return null;

  const period = PERIODS.find((candidate) => candidate.key === periodKey)!;
  const from = periodStart(period.months);
  const inPeriod = selected.points.filter((point) => !from || point.date >= from);
  const bestBefore = from ? Math.max(0, ...selected.points.filter((point) => point.date < from).map((point) => point.weightKg)) : 0;
  const best = inPeriod.reduce<Point | undefined>((top, point) => (!top || point.weightKg > top.weightKg ? point : top), undefined);
  const gain = best && inPeriod.length > 1 ? best.weightKg - inPeriod[0].weightKg : null;

  return (
    <Card>
      <h2 className="mb-3 font-semibold">Progress</h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {series.map(({ scheme }) => (
          <button
            key={scheme.id}
            type="button"
            onClick={() => setSelectedId(scheme.id)}
            className={`min-h-9 rounded-lg px-3 text-sm ${scheme.id === selected.scheme.id ? "bg-accent font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
          >
            {scheme.name}
          </button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-4 gap-1 rounded-xl bg-zinc-800/60 p-1">
        {PERIODS.map((candidate) => (
          <button
            key={candidate.key}
            type="button"
            onClick={() => setPeriodKey(candidate.key)}
            className={`min-h-9 rounded-lg text-sm ${candidate.key === periodKey ? "bg-zinc-700 font-semibold" : "text-zinc-400"}`}
          >
            {candidate.label}
          </button>
        ))}
      </div>
      {inPeriod.length === 0 ? (
        <p className="py-6 text-center text-sm text-zinc-500">No {selected.scheme.name} in this period.</p>
      ) : (
        <>
          <div className="mb-2 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-lg bg-zinc-800 px-3 py-2">
              <div className="text-zinc-400">Best</div>
              <div><span className="text-lg font-semibold text-accent">{formatKg(best!.weightKg)}</span> <span className="text-zinc-500">kg · {formatDate(best!.date)}</span></div>
            </div>
            <div className="rounded-lg bg-zinc-800 px-3 py-2">
              <div className="text-zinc-400">{from && bestBefore > 0 ? "vs before" : "Change"}</div>
              <div className="text-lg font-semibold">
                {from && bestBefore > 0 ? signedKg(best!.weightKg - bestBefore) : gain !== null ? signedKg(gain) : "–"}
              </div>
            </div>
          </div>
          <ProgressChart points={inPeriod} from={from} bestBefore={bestBefore} />
          <div className="mt-1 flex justify-between text-xs text-zinc-500">
            <span>{formatDate(from ?? inPeriod[0].date)}</span>
            <span>line = record · dots = sessions</span>
            <span>{formatDate(from ? todayIso() : inPeriod.at(-1)!.date)}</span>
          </div>
        </>
      )}
    </Card>
  );
}

function signedKg(deltaKg: number): string {
  if (deltaKg === 0) return "±0 kg";
  return `${deltaKg > 0 ? "+" : "−"}${formatKg(Math.abs(deltaKg))} kg`;
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
