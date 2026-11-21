import { useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { entryResultKg } from "../../shared/records";
import type { Entry, Scheme } from "../../shared/types";
import { useExercise, useSchemes } from "../api";
import { Card, ErrorText, Input, Loading, PageHeader, Select } from "../components/ui";
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

function ProgressChart({ entries, schemes }: { entries: Entry[]; schemes: Scheme[] }) {
  const schemeById = useMemo(() => new Map(schemes.map((scheme) => [scheme.id, scheme])), [schemes]);
  const series = useMemo(() => {
    const bySchemeId = new Map<string, { date: string; weightKg: number }[]>();
    for (const entry of [...entries].reverse()) {
      const scheme = schemeById.get(entry.schemeId);
      if (!scheme) continue;
      const weightKg = entryResultKg({
        date: entry.date, schemeId: scheme.id, schemeName: scheme.name, schemePosition: 0,
        kind: scheme.kind, targetSets: scheme.sets, targetReps: scheme.reps, sets: entry.sets,
      });
      if (weightKg === null || weightKg <= 0) continue;
      const points = bySchemeId.get(scheme.id) ?? [];
      points.push({ date: entry.date, weightKg });
      bySchemeId.set(scheme.id, points);
    }
    return [...bySchemeId.entries()].filter(([, points]) => points.length >= 2);
  }, [entries, schemeById]);
  const [selectedId, setSelectedId] = useState<string>();
  const selected = series.find(([id]) => id === selectedId) ?? series[0];
  if (!selected) return null;

  const [, points] = selected;
  const times = points.map((point) => new Date(point.date).getTime());
  const weights = points.map((point) => point.weightKg);
  const [minTime, maxTime] = [Math.min(...times), Math.max(...times)];
  const [minWeight, maxWeight] = [Math.min(...weights), Math.max(...weights)];
  const width = 320;
  const height = 140;
  const x = (time: number) => 8 + ((time - minTime) / (maxTime - minTime || 1)) * (width - 16);
  const y = (weight: number) => height - 12 - ((weight - minWeight) / (maxWeight - minWeight || 1)) * (height - 24);
  const path = points.map((point, index) => `${index ? "L" : "M"}${x(times[index]).toFixed(1)},${y(point.weightKg).toFixed(1)}`).join(" ");

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">Progress</h2>
        <span className="text-sm text-zinc-400">{formatKg(minWeight)} → {formatKg(maxWeight)} kg</span>
      </div>
      <div className="mb-3 flex flex-wrap gap-2">
        {series.map(([id]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSelectedId(id)}
            className={`rounded-lg px-2.5 py-1 text-sm ${id === selected[0] ? "bg-accent text-zinc-950" : "bg-zinc-800 text-zinc-300"}`}
          >
            {schemeById.get(id)?.name}
          </button>
        ))}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        <path d={path} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" />
        {points.map((point, index) => (
          <circle key={index} cx={x(times[index])} cy={y(point.weightKg)} r={3} fill="var(--color-accent)" />
        ))}
      </svg>
      <div className="flex justify-between text-xs text-zinc-500">
        <span>{formatDate(points[0].date)}</span>
        <span>{formatDate(points.at(-1)!.date)}</span>
      </div>
    </Card>
  );
}

export function ExercisePage() {
  const { exerciseId = "" } = useParams();
  const { data: exercise, isPending, error } = useExercise(exerciseId);
  const { data: schemes } = useSchemes();

  if (isPending) return <Loading />;
  if (!exercise) return <div className="p-4"><ErrorText error={error ?? "Not found"} /></div>;

  const oneRepMax = exercise.records.find((record) => schemes?.find((scheme) => scheme.id === record.schemeId && scheme.kind === "max" && scheme.reps === 1));

  return (
    <>
      <PageHeader
        title={exercise.displayName}
        action={<Link to={`/log?exercise=${exercise.id}`} className="shrink-0 rounded-xl bg-accent px-4 py-2 font-semibold text-zinc-950">Log</Link>}
      />
      <div className="flex flex-col gap-3 px-4">
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
        {schemes && <ProgressChart entries={exercise.entries} schemes={schemes} />}
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
