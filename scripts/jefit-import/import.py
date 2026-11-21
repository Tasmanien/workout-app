"""One-time JEFIT history import: builds a review report, then (with --sql) the SQL to load into D1."""
import argparse
import collections
import re
from dataclasses import dataclass, field
from pathlib import Path

from jefit import read_sections

MAX_RECORD_REPS = 5
MIN_FIXED_SETS = 3
MAX_FIXED_SETS = 5
WORKING_SET_RATIO = 0.8
FIXED_REP_TARGETS = (3, 5)
TECHNIQUE_RATIO = 0.6
APP_SCHEMES = ["1RM", "2RM", "3RM", "5RM", "5x5", "3x3"]
CARDIO_EXERCISE_IDS = {"317"}

COMPLEXES = {
    "Barbell Clean and Jerk": ("Clean + Jerk", ["Clean", "Jerk"]),
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
    "Barbell Bent Over Row": "Barbell row",
    "Barbell Bent-Over Row": "Barbell row",
    "Barbell Row": "Barbell row",
    "Barbell Tricep Extension (Supine)": "Barbell skull crusher",
    "Barbell Lying Triceps Extension": "Barbell skull crusher",
    "Barbell Triceps Extension": "Barbell skull crusher",
    "Barbell Tricep Extension": "Barbell skull crusher",
}

CLEAN_NAMES = {
    'dumbbell step-ups': 'Dumbbell step-up',
    'dumbbell one-arm row': 'One-arm dumbbell row',
    'back extension machine': 'Back extension',
    'barbell ab rollout': 'Ab rollout',
    'barbell ab rollout (kneeling)': 'Ab rollout',
    'barbell bench press (close grip)': 'Close-grip bench press',
    'barbell close grip bench press': 'Close-grip bench press',
    'barbell decline bench press': 'Decline bench press',
    'barbell ez bar reverse grip curl': 'EZ bar reverse curl',
    'barbell front raise': 'Front raise',
    'barbell glute bridge': 'Glute bridge',
    'barbell lunge': 'Barbell lunge',
    'barbell preacher curl': 'Preacher curl',
    'barbell reverse curl': 'Reverse curl',
    'barbell romanian deadlift': 'Romanian deadlift',
    'barbell seated calf raise': 'Seated calf raise',
    'barbell shrug': 'Barbell shrug',
    'barbell skull crusher': 'Skull crusher',
    'barbell spider curl': 'Spider curl',
    'barbell standing calf raise': 'Standing calf raise',
    'barbell stiff-leg deadlift': 'Stiff-leg deadlift',
    'barbell stiff-legged deadlift': 'Stiff-leg deadlift',
    'barbell up right row': 'Upright row',
    'barbell upright row': 'Upright row',
    'bench leg raise (supine)': 'Lying leg raise',
    'bench press machine': 'Machine chest press',
    'cable close grip curl': 'Cable curl',
    'cable incline pullover': 'Cable pullover',
    'cable lat pulldown (wide grip)': 'Lat pulldown',
    'cable lower chest raise': 'Low cable fly',
    'cable mid chest crossovers': 'Cable crossover',
    'cable one arm tricep extension': 'One-arm cable pushdown',
    'cable one-arm tricep pushdown': 'One-arm cable pushdown',
    'cable reverse curl': 'Cable reverse curl',
    'cable rope face pull': 'Face pull',
    'cable rope hammer curl': 'Cable hammer curl',
    'cable rope hammer curls': 'Cable hammer curl',
    'cable rope overhead triceps extension': 'Cable overhead triceps extension',
    'cable rope seated row': 'Seated cable row',
    'cable rope tricep pushdown': 'Rope pushdown',
    'cable rope triceps pushdown': 'Rope pushdown',
    'cable seated curl': 'Cable curl',
    'cable standing biceps curl': 'Cable curl',
    'cable standing leg curl': 'Standing cable leg curl',
    'cable tricep pushdown (rope)': 'Rope pushdown',
    'cable tricep pushdown (v-bar)': 'V-bar pushdown',
    'cable triceps pushdown': 'Triceps pushdown',
    'cable underhand pull down': 'Underhand lat pulldown',
    'cable v bar pull down': 'Close-grip lat pulldown',
    'close grip front lat pulldown': 'Close-grip lat pulldown',
    'close triceps pushup': 'Diamond push-up',
    'dip machine': 'Machine dip',
    'dumbbell arnold press': 'Arnold press',
    'dumbbell bent over delt raise': 'Dumbbell reverse fly',
    'dumbbell lunge': 'Dumbbell lunge',
    'dumbbell lunges': 'Dumbbell lunge',
    'dumbbell lying triceps extension': 'Dumbbell skull crusher',
    'dumbbell one arm row': 'One-arm dumbbell row',
    'dumbbell one arm standing arnold press': 'One-arm Arnold press',
    'dumbbell one arm up right row': 'One-arm dumbbell upright row',
    'dumbbell reverse fly': 'Dumbbell reverse fly',
    'dumbbell reverse flyes': 'Dumbbell reverse fly',
    'dumbbell seated arnold press': 'Arnold press',
    'dumbbell seated bent-over reverse fly': 'Dumbbell reverse fly',
    'dumbbell seated shoulder press': 'Dumbbell shoulder press',
    'dumbbell shoulder press': 'Dumbbell shoulder press',
    'dumbbell shoulder shrug': 'Dumbbell shrug',
    'dumbbell standing one arm triceps extension': 'Dumbbell overhead triceps extension',
    'dumbbell standing triceps extension': 'Dumbbell overhead triceps extension',
    'dumbbell standing triceps kickback': 'Dumbbell kickback',
    'dumbbell step ups': 'Dumbbell step-up',
    'dumbbell step-up': 'Dumbbell step-up',
    'dumbbell tricep extension': 'Dumbbell overhead triceps extension',
    'dumbbell tricep kickback': 'Dumbbell kickback',
    'dumbbell walking lunges': 'Dumbbell lunge',
    'ez bar close grip curl': 'EZ bar curl',
    'ez bar curl': 'EZ bar curl',
    'ez bar tricep extension (close grip)': 'Skull crusher',
    'flat bench lying leg raise': 'Lying leg raise',
    'hanging knee raise': 'Hanging knee raise',
    'hanging knee raise rotation': 'Hanging knee raise',
    'hip adduction': 'Hip adduction',
    'hyperextensions - back extensions': 'Back extension',
    'landmine chest press': 'Landmine press',
    'machine calf raise': 'Machine calf raise',
    'machine incline chest press': 'Machine incline chest press',
    'preacher curl machine': 'Machine preacher curl',
    'push up': 'Push-up',
    'seated calf raise': 'Seated calf raise',
    'seated leg curl': 'Seated leg curl',
    'seated machine row': 'Machine row',
    't bar row': 'T-bar row',
    'thigh abductor': 'Hip abduction',
    'thigh adductor': 'Hip adduction',
    'triceps pushdown v bar': 'V-bar pushdown',
    'weight plate reverse curl': 'Plate reverse curl',
}


REMOVED = {
    "Leg Press", "Lying Leg Curls", "Wide Grip Lat Pulldown", "Cable Seated Row", "Leg Extensions", "Leg Extension",
}

MACHINE_PATTERN = re.compile(
    r"machine|cable|smith|leg press|leg extension|leg curl|pull ?down|push ?down|hack squat|adductor|abductor|adduction|^(?!barbell).*calf raise|hyperextension",
    re.IGNORECASE,
)

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
    top_weight: float
    notes: str | None = None


@dataclass
class ExerciseMapping:
    name: str
    movements: list[str]
    jefit_names: set[str] = field(default_factory=set)

    @property
    def is_machine(self) -> bool:
        return any(MACHINE_PATTERN.search(name) for name in self.jefit_names)

    @property
    def category(self) -> str:
        if len(self.movements) > 1:
            return "complex"
        if self.is_machine:
            return "machine"
        if any(BODYWEIGHT_PATTERN.search(name) for name in self.jefit_names):
            return "bodyweight"
        return "free"
    entries: list[ImportedEntry] = field(default_factory=list)
    technique: list[tuple[ImportedEntry, float]] = field(default_factory=list)
    dropped: int = 0


def sentence_case(name: str) -> str:
    name = name.strip()
    return name[:1].upper() + name[1:].lower()


def map_exercise(jefit_name: str) -> tuple[str, list[str]] | None:
    if jefit_name in REMOVED:
        return None
    if jefit_name in COMPLEXES:
        return COMPLEXES[jefit_name]
    if DUMBBELL_CURL_PATTERN.search(jefit_name):
        movement = "Dumbbell bicep curl"
    else:
        movement = MOVEMENT_NAMES.get(jefit_name, sentence_case(jefit_name))
    movement = CLEAN_NAMES.get(movement.lower(), movement)
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


def classify(sets: list[tuple[float, int]]) -> list[tuple[str, list[tuple[float, int]]]]:
    if not sets:
        return []
    in_session_order = {id(s): index for index, s in enumerate(sets)}
    ordered = sorted(sets, key=lambda s: (-s[0], -s[1]))
    top_weight = ordered[0][0]
    working = [s for s in ordered if s[0] >= WORKING_SET_RATIO * top_weight]

    candidates: list[tuple[int, int, float, list[tuple[float, int]]]] = []
    for count in range(MIN_FIXED_SETS, min(MAX_FIXED_SETS, len(working)) + 1):
        chosen = working[:count]
        reps = max((r for r in FIXED_REP_TARGETS if r <= min(r for _, r in chosen)), default=None)
        if reps:
            candidates.append((count, reps, chosen[-1][0], chosen))
    fixed = [
        c for c in candidates
        if not any(o is not c and o[0] >= c[0] and o[1] >= c[1] and o[2] >= c[2] for o in candidates)
    ]

    results = [(f"{count}x{reps}", sorted(chosen, key=lambda s: in_session_order[id(s)])) for count, reps, _, chosen in fixed]
    best_reps = min(MAX_RECORD_REPS, max(r for w, r in ordered if w == top_weight))
    top_set = max((s for s in ordered if s[0] == top_weight), key=lambda s: s[1])
    covered = any(weight >= top_weight and reps >= best_reps for _, reps, weight, _ in fixed)
    if not covered:
        results.insert(0, (f"{best_reps}RM", [top_set]))
    return results


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


def scheme_position(scheme: str) -> int:
    kind, sets, reps = scheme_shape(scheme)
    return reps if kind == "max" else 10 * sets + reps


def scheme_order(scheme: str) -> tuple[int, int, int]:
    kind, sets, reps = scheme_shape(scheme)
    return (0 if kind == "max" else 1, reps, sets)


def drop_technique_work(mapping: ExerciseMapping) -> None:
    kept, best_before = [], 0.0
    by_date: dict[str, list[ImportedEntry]] = {}
    for entry in mapping.entries:
        by_date.setdefault(entry.date, []).append(entry)
    for date in sorted(by_date):
        session = by_date[date]
        top_weight = session[0].top_weight
        if best_before and top_weight < TECHNIQUE_RATIO * best_before:
            mapping.technique.extend((entry, best_before) for entry in session)
            continue
        kept.extend(session)
        best_before = max(best_before, top_weight)
    mapping.entries = kept


excluded: set[str] = set()


CATEGORY_TITLES = {"complex": "Complexes", "free": "Free weights", "machine": "Machines and cables", "bodyweight": "Bodyweight (weighted sets only)"}


def read_keep_list(path: Path) -> set[str]:
    names = set()
    for line in path.read_text().splitlines():
        match = re.match(r"^\s*-\s+(.+?)(\s+\(\d+ entr(y|ies)\))?(\s*-->.*)?\s*$", line)
        if match:
            names.add(match.group(1).strip().lower())
    return names


def apply_keep_list(mappings: dict[str, ExerciseMapping], keep: set[str]) -> None:
    for name in list(mappings):
        if name.lower() not in keep:
            excluded.update(mappings.pop(name).jefit_names)


def write_exercise_list(mappings: dict[str, ExerciseMapping], output: Path) -> None:
    lines = [
        "# JEFIT exercises to import",
        "",
        "Delete the lines of the exercises you don't want, then tell Claude. Names are the new ones; the count is the",
        "number of entries each would bring. Exercises with nothing importable (bodyweight-only, high-rep only) are not listed.",
    ]
    for category, title in CATEGORY_TITLES.items():
        group = sorted((m for m in mappings.values() if m.entries and m.category == category), key=lambda m: m.name.lower())
        lines += ["", f"## {title} ({len(group)})", ""]
        lines += [f"- {m.name} ({len(m.entries)} {'entry' if len(m.entries) == 1 else 'entries'})" for m in group]
    output.write_text("\n".join(lines) + "\n")


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
        session_sets = [s for log in logs for s in parse_sets(log["logs"])]
        results = classify(session_sets)
        if not results:
            mapping.dropped += 1
            continue
        session_notes = [notes[(log["eid"], date)] for log in logs if (log["eid"], date) in notes]
        for scheme, sets in results:
            mapping.entries.append(ImportedEntry(
                jefit_id=f"{logs[0]['_id']}-{scheme.lower()}", date=date,
                jefit_name=", ".join(sorted({log["ename"].strip() for log in logs})),
                scheme=scheme, sets=sets, original=" + ".join(log["logs"] for log in logs),
                top_weight=max(w for w, _ in session_sets),
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
            same_day_tie = best is not None and weight == best[0] and entry.date == best[1].date
            better_source = same_day_tie and best[1].scheme != target and (
                entry.scheme == target or scheme_position(entry.scheme) < scheme_position(best[1].scheme)
            )
            if best is None or weight > best[0] or (weight == best[0] and entry.date < best[1].date) or better_source:
                best = (weight, entry)
        if best:
            records.append((target, best[1]))
    return records


def format_sets(sets: list[tuple[float, int]]) -> str:
    return ", ".join(f"{weight:g}×{reps}" for weight, reps in sets)


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
        f"- Reps above {MAX_RECORD_REPS} count as {MAX_RECORD_REPS} (sets are stored with their real reps). Nothing goes above 5RM.",
        "- Per session (one exercise, one day):",
        f"  - **nRM:** the heaviest set → nRM with its reps (capped at {MAX_RECORD_REPS}). 60 × 2 → 2RM 60; 80 × 8 → 5RM 80.",
        f"  - **Sets × reps:** N = {MIN_FIXED_SETS} to {MAX_FIXED_SETS} sets at ≥ W kg, each with ≥ R reps → NxR at W, R being 5 or 3 (rounded down). 5 × 12 at 50 kg → 5x5 at 50; 3 × 4 → 3x3.",
        f"    Only working sets count (≥ {WORKING_SET_RATIO:.0%} of that session's top weight), so warm-ups never make a 5x5.",
        "  - A session can give several entries; one already covered by a better entry of the same session is skipped",
        "    (a 5x5 at 90 makes a 3x5 at 90 or a 5RM at 90 redundant).",
        f"- Technique work is dropped: a session whose top weight is below {TECHNIQUE_RATIO:.0%} of the best already reached on that exercise.",
        "- Bodyweight sets (0 kg) and cardio logs are dropped.",
        "- All dumbbell curl variants are merged into \"Dumbbell bicep curl\".",
        "- Several JEFIT names are merged into one exercise (see the mapping tables).",
        "- Exercises you removed are excluded (listed at the end).",
        "- The same exercise logged several times on one day is merged into one session before applying the rules.",
        "",
        "## Totals",
        "",
        f"- Entries created: **{total_kept}** from {len({(m.name, e.date) for m in kept for e in m.entries})} JEFIT sessions; sessions dropped: {total_dropped}.",
        f"- Exercises created: **{len(kept)}** (out of {len(mappings)} JEFIT exercises after merging).",
        "- Session types: " + ", ".join(f"{name} ({count})" for name, count in sorted(scheme_counts.items(), key=lambda item: (item[0][-2:] != "RM", item[0]))) + ".",
        "",
        "## Exercise mapping: free weights (only exercises with something kept)",
        "",
    ]
    mapping_header = ["| New exercise | Movements | From JEFIT | Entries | Sessions dropped |", "|---|---|---|---|---|"]

    def mapping_row(m: ExerciseMapping) -> str:
        return f"| {m.name} | {' + '.join(m.movements)} | {', '.join(sorted(m.jefit_names))} | {len(m.entries)} | {m.dropped + len(m.technique)} |"

    lines += mapping_header + [mapping_row(m) for m in kept if not m.is_machine]
    lines += ["", "## Exercise mapping: machines and cables (to review)", ""]
    lines += mapping_header + [mapping_row(m) for m in kept if m.is_machine]

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
        lines += [f"### {m.name}", "", "| Date | Session type | Sets stored | Full JEFIT log | Note |", "|---|---|---|---|---|"]
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
    parser.add_argument("--keep", type=Path, help="Exercise list to import (as written by --list); others are excluded")
    parser.add_argument("--list", action="store_true", help="Write exercises.md, the editable list of exercises to import")
    args = parser.parse_args()

    args.out.mkdir(parents=True, exist_ok=True)
    mappings = build(args.export)
    if args.keep:
        apply_keep_list(mappings, read_keep_list(args.keep))
    if args.list:
        write_exercise_list(mappings, args.out / "exercises.md")
        print(f"Exercise list: {args.out / 'exercises.md'}")
    write_report(mappings, args.out / "jefit-import-review.md")
    print(f"Report: {args.out / 'jefit-import-review.md'}")
    if args.sql:
        write_sql(mappings, args.out / "import.sql")
        print(f"SQL: {args.out / 'import.sql'}")


if __name__ == "__main__":
    main()
