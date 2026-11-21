import { useState } from "react";
import type { SchemeKind } from "../../shared/schemas";
import type { ExerciseSummary, Movement, Scheme } from "../../shared/types";
import {
  useDeleteExercise, useDeleteMovement, useDeleteScheme, useExercises, useMovements, useSaveExercise, useSaveMovement, useSaveScheme, useSchemes,
} from "../api";
import { Button, Card, ErrorText, Input, Label, Loading, PageHeader, Select } from "../components/ui";

type Tab = "exercises" | "movements" | "schemes";
const TAB_LABELS: Record<Tab, string> = { exercises: "Exercises", movements: "Movements", schemes: "Session types" };

export function ManagePage() {
  const [tab, setTab] = useState<Tab>("exercises");
  return (
    <>
      <PageHeader title="Manage" action={<a href="/api/export" download className="text-sm text-accent">Export</a>} />
      <div className="flex flex-col gap-3 px-4">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1">
          {(Object.keys(TAB_LABELS) as Tab[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`min-h-10 rounded-lg text-sm ${tab === key ? "bg-zinc-700 font-semibold" : "text-zinc-400"}`}
            >
              {TAB_LABELS[key]}
            </button>
          ))}
        </div>
        {tab === "exercises" && <ExercisesTab />}
        {tab === "movements" && <MovementsTab />}
        {tab === "schemes" && <SchemesTab />}
      </div>
    </>
  );
}

interface PartRow { movementId: string; reps: string }

function ExerciseEditor({ exercise, movements, onDone }: { exercise?: ExerciseSummary; movements: Movement[]; onDone: () => void }) {
  const [name, setName] = useState(exercise?.name ?? "");
  const [archived, setArchived] = useState(exercise?.archived ?? false);
  const [parts, setParts] = useState<PartRow[]>(exercise?.parts.map((part) => ({ movementId: part.movementId, reps: String(part.reps) })) ?? [{ movementId: "", reps: "1" }]);
  const [newMovement, setNewMovement] = useState("");
  const saveExercise = useSaveExercise();
  const deleteExercise = useDeleteExercise();
  const saveMovement = useSaveMovement();

  const updatePart = (index: number, patch: Partial<PartRow>) => setParts((current) => current.map((part, i) => (i === index ? { ...part, ...patch } : part)));
  const partsValid = parts.every((part) => part.movementId && Number.isInteger(Number(part.reps)) && Number(part.reps) >= 1);

  const addMovement = async () => {
    const created = await saveMovement.mutateAsync({ input: { name: newMovement.trim() } });
    setNewMovement("");
    const emptyIndex = parts.findIndex((part) => !part.movementId);
    if (created) {
      if (emptyIndex >= 0) updatePart(emptyIndex, { movementId: created.id });
      else setParts((current) => [...current, { movementId: created.id, reps: "1" }]);
    }
  };

  const save = async () => {
    await saveExercise.mutateAsync({
      id: exercise?.id,
      input: { name: name.trim() || null, archived, parts: parts.map((part) => ({ movementId: part.movementId, reps: Number(part.reps) })) },
    });
    onDone();
  };

  const remove = async () => {
    if (!exercise || !window.confirm(`Delete ${exercise.displayName}?`)) return;
    await deleteExercise.mutateAsync(exercise.id);
    onDone();
  };

  return (
    <Card className="flex flex-col gap-3 border border-zinc-700">
      <Label title="Movements, in order (one = single lift, several = complex)">
        <div className="flex flex-col gap-2">
          {parts.map((part, index) => (
            <div key={index} className="grid grid-cols-[4rem_1fr_2.5rem] gap-2">
              <Input inputMode="numeric" aria-label="Reps" value={part.reps} onChange={(event) => updatePart(index, { reps: event.target.value })} />
              <Select value={part.movementId} onChange={(event) => updatePart(index, { movementId: event.target.value })}>
                <option value="" disabled>Movement…</option>
                {movements.map((movement) => <option key={movement.id} value={movement.id}>{movement.name}</option>)}
              </Select>
              <button
                type="button"
                aria-label="Remove movement"
                disabled={parts.length === 1}
                onClick={() => setParts((current) => current.filter((_, i) => i !== index))}
                className="text-zinc-500 disabled:opacity-30"
              >
                ✕
              </button>
            </div>
          ))}
          <Button onClick={() => setParts((current) => [...current, { movementId: "", reps: "1" }])}>+ Movement</Button>
        </div>
      </Label>
      <div className="flex gap-2">
        <Input placeholder="New movement name" value={newMovement} onChange={(event) => setNewMovement(event.target.value)} />
        <Button disabled={!newMovement.trim() || saveMovement.isPending} onClick={addMovement}>Create</Button>
      </div>
      <Label title="Display name (optional)">
        <Input placeholder="Defaults to the movements joined with +" value={name} onChange={(event) => setName(event.target.value)} />
      </Label>
      {exercise && (
        <label className="flex items-center gap-3 text-zinc-300">
          <input type="checkbox" className="size-5 accent-amber-400" checked={archived} onChange={(event) => setArchived(event.target.checked)} />
          Archived (hidden from Records and Log)
        </label>
      )}
      <ErrorText error={saveExercise.error ?? deleteExercise.error ?? saveMovement.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!partsValid || saveExercise.isPending} onClick={save}>Save</Button>
      </div>
      {exercise && exercise.entryCount === 0 && <Button variant="danger" onClick={remove}>Delete exercise</Button>}
    </Card>
  );
}

function ExercisesTab() {
  const { data: exercises, isPending, error } = useExercises();
  const { data: movements } = useMovements();
  const [editingId, setEditingId] = useState<string | "new">();

  if (isPending) return <Loading />;
  const sorted = [...(exercises ?? [])].sort((a, b) => Number(a.archived) - Number(b.archived) || a.displayName.localeCompare(b.displayName));
  const groups = [
    { title: "Complexes", items: sorted.filter((exercise) => exercise.parts.length > 1) },
    { title: "Lifts", items: sorted.filter((exercise) => exercise.parts.length <= 1) },
  ];

  return (
    <>
      <ErrorText error={error} />
      {editingId === "new" ? (
        <ExerciseEditor movements={movements ?? []} onDone={() => setEditingId(undefined)} />
      ) : (
        <Button variant="primary" onClick={() => setEditingId("new")}>+ New exercise or complex</Button>
      )}
      {groups.map((group) => group.items.length > 0 && (
        <section key={group.title} className="flex flex-col gap-3">
          <h2 className="mt-2 text-sm font-semibold uppercase tracking-wide text-zinc-500">{group.title}</h2>
          {group.items.map((exercise) =>
            editingId === exercise.id ? (
              <ExerciseEditor key={exercise.id} exercise={exercise} movements={movements ?? []} onDone={() => setEditingId(undefined)} />
            ) : (
              <button
                key={exercise.id}
                type="button"
                onClick={() => setEditingId(exercise.id)}
                className="flex items-center justify-between rounded-2xl bg-zinc-900 p-4 text-left active:bg-zinc-800"
              >
                <span className={exercise.archived ? "text-zinc-500" : ""}>{exercise.displayName}</span>
                <span className="text-sm text-zinc-500">{exercise.archived ? "archived" : `${exercise.entryCount} sessions`}</span>
              </button>
            ),
          )}
        </section>
      ))}
    </>
  );
}

function MovementRow({ movement }: { movement: Movement }) {
  const [name, setName] = useState(movement.name);
  const saveMovement = useSaveMovement();
  const deleteMovement = useDeleteMovement();
  const changed = name.trim() !== movement.name && name.trim().length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input value={name} onChange={(event) => setName(event.target.value)} />
        {changed ? (
          <Button variant="primary" onClick={() => saveMovement.mutate({ id: movement.id, input: { name: name.trim() } })}>Save</Button>
        ) : movement.usage === 0 ? (
          <Button variant="danger" onClick={() => deleteMovement.mutate(movement.id)}>Delete</Button>
        ) : null}
      </div>
      <ErrorText error={saveMovement.error ?? deleteMovement.error} />
    </div>
  );
}

function MovementsTab() {
  const { data: movements, isPending, error } = useMovements();
  const saveMovement = useSaveMovement();
  const [name, setName] = useState("");

  if (isPending) return <Loading />;
  return (
    <>
      <ErrorText error={error ?? saveMovement.error} />
      <div className="flex gap-2">
        <Input placeholder="New movement" value={name} onChange={(event) => setName(event.target.value)} />
        <Button
          variant="primary"
          disabled={!name.trim()}
          onClick={() => saveMovement.mutate({ input: { name: name.trim() } }, { onSuccess: () => setName("") })}
        >
          Add
        </Button>
      </div>
      {movements?.map((movement) => <MovementRow key={`${movement.id}-${movement.name}`} movement={movement} />)}
    </>
  );
}

const KIND_LABELS: Record<SchemeKind, string> = { max: "Max (nRM)", fixed: "Sets × reps", free: "Free sets" };
const EDITABLE_KINDS: SchemeKind[] = ["max", "fixed"];

function SchemeEditor({ scheme, onDone }: { scheme?: Scheme; onDone: () => void }) {
  const [name, setName] = useState(scheme?.name ?? "");
  const [kind, setKind] = useState<SchemeKind>(scheme?.kind ?? "max");
  const [sets, setSets] = useState(scheme?.sets ? String(scheme.sets) : "");
  const [reps, setReps] = useState(scheme?.reps ? String(scheme.reps) : "");
  const [hidden, setHidden] = useState(scheme?.hidden ?? false);
  const saveScheme = useSaveScheme();
  const deleteScheme = useDeleteScheme();

  const suggestedName = kind === "max" && reps ? `${reps}RM` : kind === "fixed" && sets && reps ? `${sets}x${reps}` : "";
  const finalName = name.trim() || suggestedName;
  const valid = !!finalName && (kind === "free" || Number(reps) >= 1) && (kind !== "fixed" || Number(sets) >= 1);

  const save = async () => {
    await saveScheme.mutateAsync({
      id: scheme?.id,
      input: { name: finalName, kind, hidden, sets: kind === "fixed" ? Number(sets) : null, reps: kind === "free" ? null : Number(reps) },
    });
    onDone();
  };

  return (
    <Card className="flex flex-col gap-3 border border-zinc-700">
      <Label title="Kind">
        <Select value={kind} onChange={(event) => setKind(event.target.value as SchemeKind)}>
          {EDITABLE_KINDS.map((key) => <option key={key} value={key}>{KIND_LABELS[key]}</option>)}
        </Select>
      </Label>
      {kind !== "free" && (
        <div className="grid grid-cols-2 gap-3">
          {kind === "fixed" && (
            <Label title="Sets"><Input inputMode="numeric" value={sets} onChange={(event) => setSets(event.target.value)} /></Label>
          )}
          <Label title="Reps"><Input inputMode="numeric" value={reps} onChange={(event) => setReps(event.target.value)} /></Label>
        </div>
      )}
      <Label title="Name">
        <Input placeholder={suggestedName || "e.g. EMOM 10"} value={name} onChange={(event) => setName(event.target.value)} />
      </Label>
      <label className="flex items-center gap-3 text-zinc-300">
        <input type="checkbox" className="size-5 accent-amber-400" checked={hidden} onChange={(event) => setHidden(event.target.checked)} />
        Hidden (no record shown, not offered when logging)
      </label>
      <ErrorText error={saveScheme.error ?? deleteScheme.error} />
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={onDone}>Cancel</Button>
        <Button variant="primary" disabled={!valid || saveScheme.isPending} onClick={save}>Save</Button>
      </div>
      {scheme && scheme.usage === 0 && (
        <Button variant="danger" onClick={() => deleteScheme.mutate(scheme.id, { onSuccess: onDone })}>Delete</Button>
      )}
    </Card>
  );
}

function SchemesTab() {
  const { data: schemes, isPending, error } = useSchemes();
  const [editingId, setEditingId] = useState<string | "new">();

  if (isPending) return <Loading />;
  return (
    <>
      <ErrorText error={error} />
      {editingId === "new" ? (
        <SchemeEditor onDone={() => setEditingId(undefined)} />
      ) : (
        <Button variant="primary" onClick={() => setEditingId("new")}>+ New session type</Button>
      )}
      {schemes?.map((scheme) =>
        editingId === scheme.id ? (
          <SchemeEditor key={scheme.id} scheme={scheme} onDone={() => setEditingId(undefined)} />
        ) : (
          <button
            key={scheme.id}
            type="button"
            onClick={() => setEditingId(scheme.id)}
            className="flex items-center justify-between rounded-2xl bg-zinc-900 p-4 text-left active:bg-zinc-800"
          >
            <span className={scheme.hidden ? "text-zinc-500" : ""}>{scheme.name}</span>
            <span className="text-sm text-zinc-500">{scheme.hidden ? "hidden · " : ""}{KIND_LABELS[scheme.kind]} · {scheme.usage} sessions</span>
          </button>
        ),
      )}
    </>
  );
}
