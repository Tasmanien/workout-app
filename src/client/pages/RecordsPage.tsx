import { useMemo, useState } from "react";
import { Link } from "react-router";
import type { ExerciseSummary, RecordValue } from "../../shared/types";
import { useExercises } from "../api";
import { ErrorText, Input, Loading, PageHeader } from "../components/ui";
import { formatDate, formatKg } from "../format";

const HEADLINE_SCHEMES = ["1RM", "3RM", "5RM", "5x5"];
const HEADLINE_COUNT = 4;

function headlineRecords(records: RecordValue[]): RecordValue[] {
  const preferred = HEADLINE_SCHEMES.map((name) => records.find((record) => record.schemeName === name)).filter((record) => !!record);
  const others = records.filter((record) => !preferred.includes(record));
  return [...preferred, ...others].slice(0, HEADLINE_COUNT);
}

function ExerciseCard({ exercise }: { exercise: ExerciseSummary }) {
  const isComplex = exercise.parts.length > 1;
  return (
    <Link
      to={`/exercises/${exercise.id}`}
      className={`rounded-2xl bg-zinc-900 p-4 active:bg-zinc-800 ${isComplex ? "border-l-4 border-violet-400/70" : ""}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-semibold">{exercise.displayName}</h3>
        {exercise.lastDate && <span className="shrink-0 text-xs text-zinc-500">{formatDate(exercise.lastDate)}</span>}
      </div>
      {exercise.records.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {headlineRecords(exercise.records).map((record) => (
            <span key={record.schemeId} className="rounded-lg bg-zinc-800 px-2.5 py-1 text-sm">
              <span className="text-zinc-400">{record.schemeName}</span>{" "}
              <span className="font-semibold text-accent">{formatKg(record.weightKg)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-zinc-500">No record yet</p>
      )}
    </Link>
  );
}

function Section({ title, exercises }: { title: string; exercises: ExerciseSummary[] }) {
  if (exercises.length === 0) return null;
  return (
    <section className="flex flex-col gap-3">
      <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{title}</h2>
      {exercises.map((exercise) => <ExerciseCard key={exercise.id} exercise={exercise} />)}
    </section>
  );
}

export function RecordsPage() {
  const { data: exercises, isPending, error } = useExercises();
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (exercises ?? [])
      .filter((exercise) => !exercise.archived && exercise.displayName.toLowerCase().includes(term))
      .sort((a, b) => (b.lastDate ?? "").localeCompare(a.lastDate ?? "") || a.displayName.localeCompare(b.displayName));
  }, [exercises, search]);

  return (
    <>
      <PageHeader title="Records" />
      <div className="flex flex-col gap-3 px-4">
        <Input type="search" placeholder="Search exercises" value={search} onChange={(event) => setSearch(event.target.value)} />
        <ErrorText error={error} />
        {isPending && <Loading />}
        {exercises && visible.length === 0 && (
          <p className="py-8 text-center text-zinc-500">
            {exercises.length ? "No match." : <>No exercises yet. <Link to="/manage" className="text-accent">Create one</Link>.</>}
          </p>
        )}
        <Section title="Complexes" exercises={visible.filter((exercise) => exercise.parts.length > 1)} />
        <Section title="Lifts" exercises={visible.filter((exercise) => exercise.parts.length <= 1)} />
      </div>
      <Link
        to="/log"
        aria-label="Log a session"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+5rem)] right-5 z-20 flex size-14 items-center justify-center rounded-full bg-accent text-3xl text-zinc-950 shadow-lg shadow-black/50 active:bg-accent-strong"
      >
        +
      </Link>
    </>
  );
}
