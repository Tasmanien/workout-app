"""One-time JEFIT history import: builds a review report, then (with --sql) the SQL to load into D1."""
import argparse
import collections
import re
from dataclasses import dataclass, field
from pathlib import Path

from jefit import read_sections

MAX_RECORD_REPS = 5
CAPPED_REPS = 6
MIN_FIXED_SETS = 3
TECHNIQUE_RATIO = 0.6
APP_SCHEMES = ["1RM", "2RM", "3RM", "5RM", "5x5", "3x3"]
CARDIO_EXERCISE_IDS = {"317"}

COMPLEXES = {
    "Barbell Clean and Jerk": ("Clean & jerk", ["Clean", "Jerk"]),
}

MOVEMENT_NAMES = {
    "Barbell Bench Press": "Bench press",
    "Barbell Squat": "Back squat",
    "Barbell Deadlift": "Deadlift",
    "Barbell Power Snatch": "Power snatch",
    "Barbell Military Press": "Strict press",
    "Barbell Shoulder Press": "Strict press",
    "Barbell Standing Military Press": "Strict press",
    "Barbell Power Clean from Blocks": "Power clean",
    "Barbell Front Squat": "Front squat",
    "Barbell Snatch": "Snatch",
    "Barbell Push Press": "Push press",
    "Barbell Hang Clean": "Hang clean",
    "Barbell Clean": "Clean",
    "Barbell Incline Bench Press": "Incline bench press",
    "Barbell Overhead Squat": "Overhead squat",
    "Barbell Clean Pull": "Clean pull",
    "Barbell Snatch Pull": "Snatch pull",
    "Barbell Split Jerk": "Split jerk",
    "Barbell Hang Snatch": "Hang snatch",
    "Weighted Pull-Up": "Weighted pull-up",
    "Pull-Up": "Weighted pull-up",
    "Pull Ups": "Weighted pull-up",
    "Barbell Tricep Extension (Supine)": "Barbell skull crusher",
    "Barbell Lying Triceps Extension": "Barbell skull crusher",
}

BODYWEIGHT_PATTERN = re.compile(r"push.?up|pushup|crunch|\bdips?\b|leg raise|knee raise|plank|leg tuck|bodyweight", re.IGNORECASE)
DUMBBELL_CURL_PATTERN = re.compile(r"^dumbbell\b.*\bcurls?\b", re.IGNORECASE)


@dataclass
class ImportedEntry:
    jefit_id: str
    date: str
    jefit_name: str
    scheme: str
    sets: list[tuple[float, int]]
    original: str
    notes: str | None = None


@dataclass
class ExerciseMapping:
    name: str
    movements: list[str]
    jefit_names: set[str] = field(default_factory=set)
    entries: list[ImportedEntry] = field(default_factory=list)
    technique: list[tuple[ImportedEntry, float]] = field(default_factory=list)
    dropped: int = 0


def sentence_case(name: str) -> str:
    name = name.strip()
    return name[:1].upper() + name[1:].lower()


def map_exercise(jefit_name: str) -> tuple[str, list[str]] | None:
    if BODYWEIGHT_PATTERN.search(jefit_name) and "machine" not in jefit_name.lower():
        return None
    if jefit_name in COMPLEXES:
        return COMPLEXES[jefit_name]
    if DUMBBELL_CURL_PATTERN.search(jefit_name):
        return "Dumbbell bicep curl", ["Dumbbell bicep curl"]
    movement = MOVEMENT_NAMES.get(jefit_name, sentence_case(jefit_name))
    return movement, [movement]


def parse_sets(logs: str) -> list[tuple[float, int]]:
    sets = []
    for chunk in logs.split(","):
        match = re.fullmatch(r"\s*([\d.]+)x(\d+)\s*", chunk)
        if not match:
            continue
        weight, reps = round(float(match.group(1)), 1), int(match.group(2))
        if weight > 0 and reps > 0:
            sets.append((weight, reps))
    return sets


def classify(sets: list[tuple[float, int]]) -> tuple[str, list[tuple[float, int]]] | None:
    if not sets:
        return None
    top_weight = max(weight for weight, _ in sets)
    top_sets = [s for s in sets if s[0] == top_weight]
    top_reps = {reps for _, reps in top_sets}
    if len(top_sets) >= MIN_FIXED_SETS and len(top_reps) == 1 and 2 <= max(top_reps) <= MAX_RECORD_REPS:
        return f"{len(top_sets)}x{max(top_reps)}", top_sets
    best_reps = max(top_reps)
    if best_reps <= CAPPED_REPS:
        return f"{min(best_reps, MAX_RECORD_REPS)}RM", [(top_weight, best_reps)]
    return None


def scheme_shape(scheme: str) -> tuple[str, int, int]:
    if scheme.endswith("RM"):
        return "max", 1, int(scheme[:-2])
    sets, reps = map(int, scheme.split("x"))
    return "fixed", sets, reps


def scheme_covers(done: str, target: str) -> bool:
    done_kind, done_sets, done_reps = scheme_shape(done)
    target_kind, target_sets, target_reps = scheme_shape(target)
    if target_kind == "max":
        return done_reps >= target_reps
    return done_kind == "fixed" and done_sets >= target_sets and done_reps >= target_reps


def scheme_order(scheme: str) -> tuple[int, int, int]:
    kind, sets, reps = scheme_shape(scheme)
    return (0 if kind == "max" else 1, reps, sets)


def drop_technique_work(mapping: ExerciseMapping) -> None:
    kept, best_so_far = [], 0.0
    for entry in sorted(mapping.entries, key=lambda e: e.date):
        weight = entry.sets[0][0]
        if best_so_far and weight < TECHNIQUE_RATIO * best_so_far:
            mapping.technique.append((entry, best_so_far))
            continue
        kept.append(entry)
        best_so_far = max(best_so_far, weight)
    mapping.entries = kept


excluded: set[str] = set()


def build(path: Path) -> dict[str, ExerciseMapping]:
    sections = read_sections(path)
    notes = {(n["eid"], n["mydate"]): n["mynote"].strip() for n in sections["NOTES"] if n["mynote"].strip()}
    mappings: dict[str, ExerciseMapping] = {}
    sessions: dict[tuple[str, str], list[dict]] = {}
    canonical_by_slug: dict[str, str] = {}
    for log in sections["EXERCISE LOGS"]:
        jefit_name = log["ename"].strip()
        mapped = map_exercise(jefit_name) if jefit_name and log["eid"] not in CARDIO_EXERCISE_IDS else None
        if mapped is None:
            excluded.add(jefit_name or "(unnamed cardio)")
            continue
        name, movements = mapped
        name = canonical_by_slug.setdefault(slug(name), name)
        movements = [canonical_by_slug.setdefault(slug(movement), movement) for movement in movements]
        mapping = mappings.setdefault(name, ExerciseMapping(name, movements))
        mapping.jefit_names.add(jefit_name)
        sessions.setdefault((name, log["mydate"]), []).append(log)

    for (name, date), logs in sessions.items():
        mapping = mappings[name]
        logs.sort(key=lambda log: int(log["_id"]))
        result = classify([s for log in logs for s in parse_sets(log["logs"])])
        if result is None:
            mapping.dropped += 1
            continue
        scheme, sets = result
        session_notes = [notes[(log["eid"], date)] for log in logs if (log["eid"], date) in notes]
        mapping.entries.append(ImportedEntry(
            jefit_id=logs[0]["_id"], date=date, jefit_name=", ".join(sorted({log["ename"].strip() for log in logs})),
            scheme=scheme, sets=sets, original=" + ".join(log["logs"] for log in logs),
            notes=" / ".join(dict.fromkeys(session_notes)) or None,
        ))
    for mapping in mappings.values():
        drop_technique_work(mapping)
    return mappings


def compute_records(entries: list[ImportedEntry], schemes: list[str]) -> list[tuple[str, ImportedEntry]]:
    records = []
    for target in sorted(schemes, key=scheme_order):
        best = None
        for entry in entries:
            if not scheme_covers(entry.scheme, target):
                continue
            weight = entry.sets[0][0] if scheme_shape(entry.scheme)[0] == "max" else min(w for w, _ in entry.sets)
            if best is None or weight > best[0] or (weight == best[0] and entry.date < best[1].date):
                best = (weight, entry)
        if best:
            records.append((target, best[1]))
    return records


def format_sets(sets: list[tuple[float, int]]) -> str:
    weight, reps = sets[0]
    weight_text = f"{weight:g}"
    return f"{len(sets)} × {reps} @ {weight_text} kg" if len(sets) > 1 else f"{reps} @ {weight_text} kg"


def write_report(mappings: dict[str, ExerciseMapping], output: Path) -> None:
    kept = [m for m in mappings.values() if m.entries]
    kept.sort(key=lambda m: (-len(m.entries), m.name))
    total_kept = sum(len(m.entries) for m in kept)
    total_dropped = sum(m.dropped + len(m.technique) for m in mappings.values())
    scheme_counts = collections.Counter(e.scheme for m in kept for e in m.entries)

    lines = [
        "# JEFIT import review",
        "",
        "Nothing has been loaded into the app yet. This is everything that would be imported.",
        "",
        "## Rules applied",
        "",
        "- Source: each JEFIT exercise log (`EXERCISE LOGS`), with its own JEFIT date. Weights are in kg in the export.",
        "- JEFIT's estimated 1RMs (`EXERCISE RECORDS`) are ignored.",
        f"- Per session, only the **top weight** is looked at. Sets with more than {MAX_RECORD_REPS} reps are never a record.",
        f"  - {MIN_FIXED_SETS}+ sets at the top weight with the same reps (2–{MAX_RECORD_REPS}) → a sets × reps entry (e.g. 5x5 @ 80).",
        f"  - Otherwise, the top set if it has ≤ {MAX_RECORD_REPS} reps → an nRM entry with that rep count (e.g. 60 × 2 → 2RM 60).",
        f"  - A top set of {CAPPED_REPS} reps counts as a {MAX_RECORD_REPS}RM (the set is stored with its real {CAPPED_REPS} reps).",
        f"  - Otherwise (top set above {CAPPED_REPS} reps) → dropped.",
        f"- Technique work is dropped: a session whose top weight is below {TECHNIQUE_RATIO:.0%} of the best already reached on that exercise.",
        "- Bodyweight sets (0 kg), bodyweight exercises and cardio logs are dropped (list at the end).",
        "- All dumbbell curl variants are merged into \"Dumbbell bicep curl\".",
        "- Several JEFIT names are merged into one exercise (see the mapping table).",
        "- The same exercise logged several times on one day is merged into one session before applying the rules.",
        "",
        "## Totals",
        "",
        f"- Sessions kept: **{total_kept}**, dropped: {total_dropped}.",
        f"- Exercises created: **{len(kept)}** (out of {len(mappings)} JEFIT exercises after merging).",
        "- Session types: " + ", ".join(f"{name} ({count})" for name, count in sorted(scheme_counts.items(), key=lambda item: (item[0][-2:] != "RM", item[0]))) + ".",
        "",
        "## Exercise mapping (only exercises with something kept)",
        "",
        "| New exercise | Movements | From JEFIT | Kept | Dropped |",
        "|---|---|---|---|---|",
    ]
    for m in kept:
        lines.append(f"| {m.name} | {' + '.join(m.movements)} | {', '.join(sorted(m.jefit_names))} | {len(m.entries)} | {m.dropped + len(m.technique)} |")

    all_schemes = sorted(set(APP_SCHEMES) | set(scheme_counts), key=scheme_order)
    lines += [
        "",
        "## Resulting records",
        "",
        "A record also counts for every lighter target it covers: a 3RM at 60 kg is also a 1RM of at least 60 kg,",
        "a 5x5 at 90 kg also covers 5RM, 3x3, 3RM, 1RM… Nothing is extrapolated upwards. \"Via\" shows where a covered record comes from.",
        "",
        "| Exercise | Session type | Best | Date | Via |",
        "|---|---|---|---|---|",
    ]
    for m in kept:
        for target, entry in compute_records(m.entries, all_schemes):
            weight = entry.sets[0][0] if scheme_shape(entry.scheme)[0] == "max" else min(w for w, _ in entry.sets)
            via = entry.scheme if entry.scheme != target else ""
            lines.append(f"| {m.name} | {target} | {weight:g} kg | {entry.date} | {via} |")

    technique = [(m, entry, best) for m in mappings.values() for entry, best in m.technique]
    lines += [
        "",
        f"## Dropped as technique work ({len(technique)})",
        "",
        f"Sessions whose top weight is below {TECHNIQUE_RATIO:.0%} of the best weight already reached on that exercise before that date.",
        "",
        "| Exercise | Date | Would have been | Best before |",
        "|---|---|---|---|",
    ]
    for m, entry, best in sorted(technique, key=lambda item: (item[0].name, item[1].date)):
        lines.append(f"| {m.name} | {entry.date} | {entry.scheme} {format_sets(entry.sets)} | {best:g} kg |")

    lines += ["", f"## Excluded JEFIT exercises ({len(excluded)})", "", ", ".join(sorted(excluded)), ""]
    lines += ["", "## Every session kept", ""]
    for m in kept:
        lines += [f"### {m.name}", "", "| Date | Session type | Kept | Full JEFIT log | Note |", "|---|---|---|---|---|"]
        for entry in sorted(m.entries, key=lambda e: e.date):
            note = (entry.notes or "").replace("|", "/")
            lines.append(f"| {entry.date} | {entry.scheme} | {format_sets(entry.sets)} | `{entry.original}` | {note} |")
        lines.append("")

    output.write_text("\n".join(lines))


def sql_text(value: str | None) -> str:
    return "NULL" if value is None else "'" + value.replace("'", "''") + "'"


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def write_sql(mappings: dict[str, ExerciseMapping], output: Path) -> None:
    kept = [m for m in mappings.values() if m.entries]
    statements = []
    movements = sorted({movement for m in kept for movement in m.movements})
    for movement in movements:
        statements.append(f"INSERT INTO movement (id, name) VALUES ({sql_text('jefit-mov-' + slug(movement))}, {sql_text(movement)}) ON CONFLICT DO NOTHING;")

    schemes = sorted({e.scheme for m in kept for e in m.entries})
    for scheme in schemes:
        if scheme.endswith("RM"):
            reps = int(scheme[:-2])
            values = f"'max', NULL, {reps}, {reps}"
        else:
            sets, reps = map(int, scheme.split("x"))
            values = f"'fixed', {sets}, {reps}, {10 * sets + reps}"
        statements.append(f"INSERT INTO scheme (id, name, kind, sets, reps, position) VALUES ({sql_text('scheme-' + scheme.lower())}, {sql_text(scheme)}, {values}) ON CONFLICT DO NOTHING;")

    for m in kept:
        exercise_id = "jefit-ex-" + slug(m.name)
        display_name = m.name if m.name != " + ".join(m.movements) else None
        statements.append(f"INSERT INTO exercise (id, name) VALUES ({sql_text(exercise_id)}, {sql_text(display_name)}) ON CONFLICT DO NOTHING;")
        for position, movement in enumerate(m.movements):
            statements.append(
                f"INSERT INTO exercise_part (exercise_id, position, movement_id, reps) "
                f"SELECT {sql_text(exercise_id)}, {position}, id, 1 FROM movement WHERE name = {sql_text(movement)} ON CONFLICT DO NOTHING;"
            )
        for entry in m.entries:
            entry_id = f"jefit-{entry.jefit_id}"
            statements.append(
                f"INSERT INTO log_entry (id, exercise_id, scheme_id, date, notes, source) "
                f"SELECT {sql_text(entry_id)}, {sql_text(exercise_id)}, id, {sql_text(entry.date)}, {sql_text(entry.notes)}, 'jefit' "
                f"FROM scheme WHERE name = {sql_text(entry.scheme)} ON CONFLICT DO NOTHING;"
            )
            for position, (weight, reps) in enumerate(entry.sets):
                statements.append(
                    f"INSERT INTO log_set (id, log_entry_id, position, reps, weight_kg, success) "
                    f"VALUES ({sql_text(f'{entry_id}-{position}')}, {sql_text(entry_id)}, {position}, {reps}, {weight:g}, 1) ON CONFLICT DO NOTHING;"
                )
    output.write_text("\n".join(statements) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("export", type=Path, help="JEFIT CSV export")
    parser.add_argument("--out", type=Path, required=True, help="Output directory (outside git)")
    parser.add_argument("--sql", action="store_true", help="Also write import.sql")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    mappings = build(args.export)
    write_report(mappings, args.out / "jefit-import-review.md")
    print(f"Report: {args.out / 'jefit-import-review.md'}")
    if args.sql:
        write_sql(mappings, args.out / "import.sql")
        print(f"SQL: {args.out / 'import.sql'}")


if __name__ == "__main__":
    main()
