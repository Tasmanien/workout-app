import { useMemo, useState } from "react";
import { Link } from "react-router";
import { useExercises } from "../api";
import { ErrorText, Input, Loading, PageHeader } from "../components/ui";
import { formatDate, formatKg } from "../format";

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
        {visible.map((exercise) => (
          <Link key={exercise.id} to={`/exercises/${exercise.id}`} className="rounded-2xl bg-zinc-900 p-4 active:bg-zinc-800">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-semibold">{exercise.displayName}</h2>
              {exercise.lastDate && <span className="shrink-0 text-xs text-zinc-500">{formatDate(exercise.lastDate)}</span>}
            </div>
            {exercise.records.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {exercise.records.slice(0, 4).map((record) => (
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
        ))}
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
