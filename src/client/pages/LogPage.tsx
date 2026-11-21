import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import type { Entry, Scheme } from "../../shared/types";
import { useDeleteEntry, useEntry, useExercises, useSaveEntry, useSchemes } from "../api";
import { Button, Card, ErrorText, Input, Label, Loading, PageHeader, Select } from "../components/ui";
import { todayIso } from "../format";

interface SetRow {
  reps: string;
  weight: string;
  success: boolean;
}

function rowsForScheme(scheme: Scheme | undefined, weight = ""): SetRow[] {
  const reps = scheme?.reps ? String(scheme.reps) : "";
  const count = scheme?.kind === "fixed" ? scheme.sets ?? 1 : 1;
  return Array.from({ length: count }, () => ({ reps, weight, success: true }));
}

function rowsFromEntry(entry: Entry): SetRow[] {
  return entry.sets.map((set) => ({ reps: String(set.reps), weight: String(set.weightKg), success: set.success }));
}

const parseNumber = (value: string) => Number(value.replace(",", "."));

export function LogPage() {
  const { entryId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { data: exercises } = useExercises();
  const { data: schemes } = useSchemes();
  const { data: entry, isPending: entryPending, error: entryError } = useEntry(entryId);
  const saveEntry = useSaveEntry();
  const deleteEntry = useDeleteEntry();

  const [exerciseId, setExerciseId] = useState(searchParams.get("exercise") ?? "");
  const [schemeId, setSchemeId] = useState("");
  const [date, setDate] = useState(todayIso());
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<SetRow[]>([{ reps: "", weight: "", success: true }]);
  const [loadedEntryId, setLoadedEntryId] = useState<string>();

  useEffect(() => {
    if (!entry || loadedEntryId === entry.id) return;
    setExerciseId(entry.exerciseId);
    setSchemeId(entry.schemeId);
    setDate(entry.date);
    setNotes(entry.notes ?? "");
    setRows(rowsFromEntry(entry));
    setLoadedEntryId(entry.id);
  }, [entry, loadedEntryId]);

  const selectableSchemes = useMemo(
    () => (schemes ?? []).filter((scheme) => (!scheme.hidden && scheme.kind !== "free") || scheme.id === schemeId),
    [schemes, schemeId],
  );

  useEffect(() => {
    if (entryId || schemeId || !selectableSchemes.length) return;
    setSchemeId(selectableSchemes[0].id);
    setRows(rowsForScheme(selectableSchemes[0]));
  }, [entryId, schemeId, selectableSchemes]);

  const selectableExercises = useMemo(
    () => (exercises ?? []).filter((exercise) => !exercise.archived || exercise.id === exerciseId).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [exercises, exerciseId],
  );

  const updateRow = (index: number, patch: Partial<SetRow>) => setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  const changeScheme = (nextId: string) => {
    setSchemeId(nextId);
    setRows(rowsForScheme(schemes?.find((scheme) => scheme.id === nextId), rows[0]?.weight ?? ""));
  };

  const parsedSets = rows.map((row) => ({ reps: parseNumber(row.reps), weightKg: parseNumber(row.weight), success: row.success }));
  const setsValid = parsedSets.length > 0 && parsedSets.every((set) => Number.isInteger(set.reps) && set.reps >= 1 && Number.isFinite(set.weightKg) && set.weightKg >= 0);
  const canSave = !!exerciseId && !!schemeId && !!date && setsValid && !saveEntry.isPending;

  const save = async () => {
    await saveEntry.mutateAsync({ id: entryId, input: { exerciseId, schemeId, date, notes: notes || null, sets: parsedSets } });
    navigate(`/exercises/${exerciseId}`, { replace: true });
  };

  const remove = async () => {
    if (!entryId || !window.confirm("Delete this session?")) return;
    await deleteEntry.mutateAsync(entryId);
    navigate(`/exercises/${exerciseId}`, { replace: true });
  };

  if (entryId && entryPending) return <Loading />;
  if (entryId && entryError) return <div className="p-4"><ErrorText error={entryError} /></div>;

  return (
    <>
      <PageHeader title={entryId ? "Edit session" : "Log session"} />
      <div className="flex flex-col gap-4 px-4">
        <Label title="Exercise">
          <Select value={exerciseId} onChange={(event) => setExerciseId(event.target.value)}>
            <option value="" disabled>Choose…</option>
            <optgroup label="Lifts">
              {selectableExercises.filter((exercise) => exercise.parts.length <= 1).map((exercise) => (
                <option key={exercise.id} value={exercise.id}>{exercise.displayName}</option>
              ))}
            </optgroup>
            <optgroup label="Complexes">
              {selectableExercises.filter((exercise) => exercise.parts.length > 1).map((exercise) => (
                <option key={exercise.id} value={exercise.id}>{exercise.displayName}</option>
              ))}
            </optgroup>
          </Select>
        </Label>
        <div className="grid grid-cols-2 gap-3">
          <Label title="Session type">
            <Select value={schemeId} onChange={(event) => changeScheme(event.target.value)}>
              {selectableSchemes.map((scheme) => <option key={scheme.id} value={scheme.id}>{scheme.name}</option>)}
            </Select>
          </Label>
          <Label title="Date">
            <Input type="date" value={date} max={todayIso()} onChange={(event) => setDate(event.target.value)} />
          </Label>
        </div>

        <Card className="flex flex-col gap-2 p-3">
          <div className="grid grid-cols-[2rem_1fr_1fr_3rem_2.5rem] gap-2 px-1 text-xs text-zinc-500">
            <span>#</span><span>kg</span><span>reps</span><span className="text-center">ok</span><span />
          </div>
          {rows.map((row, index) => (
            <div key={index} className="grid grid-cols-[2rem_1fr_1fr_3rem_2.5rem] items-center gap-2">
              <span className="text-center text-zinc-500">{index + 1}</span>
              <Input inputMode="decimal" placeholder="kg" value={row.weight} onChange={(event) => updateRow(index, { weight: event.target.value })} />
              <Input inputMode="numeric" placeholder="reps" value={row.reps} onChange={(event) => updateRow(index, { reps: event.target.value })} />
              <button
                type="button"
                aria-label={row.success ? "Mark as missed" : "Mark as made"}
                onClick={() => updateRow(index, { success: !row.success })}
                className={`min-h-11 rounded-xl text-lg ${row.success ? "bg-emerald-950 text-emerald-400" : "bg-red-950 text-red-400"}`}
              >
                {row.success ? "✓" : "✗"}
              </button>
              <button
                type="button"
                aria-label="Remove set"
                disabled={rows.length === 1}
                onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                className="min-h-11 rounded-xl text-zinc-500 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
          <div className="mt-1 grid grid-cols-2 gap-2">
            <Button onClick={() => setRows((current) => [...current, { ...(current.at(-1) ?? { reps: "", weight: "" }), success: true }])}>+ Set</Button>
            <Button disabled={!rows[0]?.weight} onClick={() => setRows((current) => current.map((row) => ({ ...row, weight: current[0].weight })))}>
              Same kg for all
            </Button>
          </div>
        </Card>

        <Label title="Notes">
          <textarea
            rows={2}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 outline-none focus:border-accent"
          />
        </Label>

        <ErrorText error={saveEntry.error ?? deleteEntry.error} />
        <Button variant="primary" disabled={!canSave} onClick={save}>{saveEntry.isPending ? "Saving…" : "Save"}</Button>
        {entryId && <Button variant="danger" onClick={remove}>Delete session</Button>}
      </div>
    </>
  );
}
