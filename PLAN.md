# Lift Log — plan

A personal web app (mobile-first, dark theme) to record weightlifting maxes and sessions: 1RM, 3RM, 5x5…, for single lifts and complexes (Clean + Front squat + Split jerk). One user, €0 running cost, data stored server-side with backups.

## 1. Stack choice

**Everything on Cloudflare's free plan**, in a single project:

| Piece | Choice | Why |
|---|---|---|
| Frontend | React + Vite + TypeScript, Tailwind CSS (dark only), TanStack Query | Simple, fast, well-known. Tailwind makes a dark theme trivial. |
| Installable app | PWA (manifest + service worker via `vite-plugin-pwa`) | "Add to Home Screen" on iOS gives a full-screen app icon. Covers most of what a native app would bring, for free. |
| API | Cloudflare Worker with [Hono](https://hono.dev) | Tiny TypeScript HTTP framework made for Workers. |
| Database | Cloudflare D1 (managed SQLite), plain SQL migrations | Real server-side database, 5 GB free, never sleeps. |
| Auth | Cloudflare Access (Zero Trust, free up to 50 users) | Login page handled by Cloudflare before any request reaches the app (email one-time code or GitHub/Google login). No auth code to write or maintain. |
| Hosting | One Worker serving both the static frontend and `/api/*` | One deploy, one URL (`lift-log.<account>.workers.dev`), no CORS. |
| CI/CD | Workers Builds (Cloudflare's git integration with GitHub) | Push to `main` → deployed. |
| Backups | D1 Time Travel (point-in-time restore, 7 days on free) + nightly CI job running `wrangler d1 export` into a private repo | Two independent copies; the SQL dump is readable and portable to any other database. |

### Why not the alternatives

- **Supabase** (Postgres + auth): great, but free projects are **paused after 7 days without activity**. A rest week = app down until you unpause it. Fails the availability requirement.
- **Firebase**: free and available, but NoSQL fits relational data (lifts, complexes, sets) poorly, and lock-in is stronger.
- **Render / Railway / Fly.io**: free tiers either sleep (30–60 s cold start) or no longer exist.
- **Vercel + Neon**: works, but two vendors, Neon also suspends compute when idle (fast resume, but still).

Cloudflare's free limits (100k requests/day, 5M rows read/day) are thousands of times what one person logging lifts will use, and nothing sleeps.

### Cost

€0. Optional later: a custom domain (~€10/year), not needed.

## 2. Data model

Three ideas: **movements** (the building blocks), **exercises** (one movement or a complex of several), and **schemes** (the session type: 1RM, 3RM, 5x5…). A **log entry** records one exercise done with one scheme on a date, with its sets.

```
movement          id, name                          -- "Clean", "Front squat", "Split jerk", "Bench press"
exercise          id, name?, archived               -- name optional, defaults to the components joined with " + "
exercise_part     exercise_id, position, movement_id, reps   -- "1 Clean + 2 Front squat + 1 Split jerk"
scheme            id, name, kind, sets?, reps?      -- kind: 'max' (find an nRM) | 'fixed' (sets × reps)
                                                    -- "1RM" = max/reps 1, "3RM" = max/reps 3, "5x5" = fixed/5/5
log_entry         id, exercise_id, scheme_id, date, notes
log_set           log_entry_id, position, reps, weight_kg, success
```

- A single lift is just an exercise with one part (Snatch = 1 × Snatch).
- In a complex, `reps` on each part is the reps of that movement within one rep of the complex (e.g. Clean 1 + Front squat 2 + Jerk 1).
- Schemes are yours to define; the app ships with 1RM, 2RM, 3RM, 5RM, 5x5, 3x3 and "Free sets" (no record) as starters you can edit or delete.
- `success` lets you record a missed attempt (useful for max days).
- Weights in kg, stored as decimals (0.5 kg plates).

**Derived, not stored:** records, one per exercise and session type, and only from real efforts. A `max` session (nRM) counts its heaviest successful set with at least n reps; a `fixed` session (5x5) counts its lightest set when every set was completed; `free` sessions never count. A 10-rep working set is never a 10RM. A result also covers every smaller target, never extrapolated upwards: a 3RM at 60 kg means a 1RM of at least 60 kg, and a 5x5 at 100 kg also counts for 3x3, 5RM, 3RM and 1RM (shown as "via 5x5").

## 3. Screens (mobile-first, dark)

1. **Records** (home): list of exercises, each showing its current 1RM / 3RM / 5RM and the date set. Search box on top.
2. **Exercise detail**: records table per rep count, history list of log entries, a small progress chart (weight over time per scheme), and a **% calculator** (60–95 % of the 1RM, rounded to 0.5/1 kg) — handy for programming.
3. **Log** (big "+" button): pick exercise → pick scheme → enter sets. For `fixed` schemes the sets are pre-filled (5 rows of 5 reps, one weight field copied down). For `max` schemes, add attempts one by one, mark missed ones. Date defaults to today.
4. **Manage**: movements, exercises/complexes (pick movements in order, set reps per movement), schemes.
5. **Settings**: export everything as JSON/CSV (your own extra backup), rounding preference.

Dark theme: near-black background (`zinc-950`), cards in `zinc-900`, one accent colour (e.g. amber) for records and the main button, large tap targets (≥ 44 px), numeric keypad (`inputmode="decimal"`) on weight fields.

## 4. API

REST under `/api`, JSON:

- `GET/POST/PATCH/DELETE /movements`, `/exercises`, `/schemes`, `/entries`
- `GET /exercises/:id/records` — best weight per rep count
- `GET /exercises/:id/entries` — history
- `GET /export` — full dump

Every request is checked by the Worker: it verifies the `Cf-Access-Jwt-Assertion` header against Cloudflare Access's public keys and the expected audience, so the API stays closed even if someone bypasses the Access login page. Input validated with Zod (shared types with the frontend).

## 5. Repo layout

```
workout-app/
  src/client/        React app
  src/worker/        Hono API + Access JWT check
  src/shared/        Zod schemas and types used by both sides
  migrations/        D1 SQL migrations
  wrangler.jsonc     Worker + D1 binding + static assets
  .github/workflows/backup.yml   nightly D1 export
  scripts/jefit-import/          one-time JEFIT import (see §9)
```

Repo: `github.com/Tasmanien/workout-app`.

## 6. Setup steps (one-time)

1. Create a free Cloudflare account; `npm create cloudflare@latest` with the React + Worker template.
2. `wrangler d1 create lift-log` and add the binding to `wrangler.jsonc`; run migrations locally then remotely.
3. Push to its own private repo; connect it in Cloudflare → Workers → Builds.
4. Zero Trust → Access → protect the Worker's hostname with a policy "email equals *your email*", login method: one-time PIN (or GitHub).
5. Put the Access audience tag and team domain in the Worker's vars for the JWT check.
6. Backup job: Cloudflare API token (D1 Edit, needed by export) stored as a CI secret; nightly `wrangler d1 export lift-log --remote`, committed to the `backups` branch.
7. On the phone: open the URL in Safari → Share → Add to Home Screen.

## 7. Milestones

| # | Scope | Result |
|---|---|---|
| 1 | Skeleton: Worker + D1 + React shell, deployed behind Access | Login works on the phone, empty app online |
| 2 | Movements, exercises (incl. complexes), schemes CRUD | Can define everything |
| 3 | Logging sets + records page | **Usable day to day** |
| 4 | Exercise detail: history, chart, % calculator | Progress tracking |
| 5 | Backups job + JSON/CSV export + restore test | Data safety proven |
| 6 | PWA polish: icon, offline read of last data, splash | Feels like a native app |

Milestones 1–3 are a weekend of work; the rest can follow.

## 8. Later: iOS

A native App Store app needs the Apple Developer Program (US$99/year). The PWA covers the need for free. If ever wanted, the same React app can be wrapped with Capacitor, reusing the same API, so nothing built now is lost.

## 9. JEFIT history import (one-time)

No endpoint: a local script, run once, then kept in the repo for reference.

1. Parse the JEFIT export (CSV) into sessions and sets, keeping each set's **original JEFIT date**.
2. Ignore JEFIT's estimated maxes. Per session, keep only real efforts at the top weight: 3+ identical sets of 2–5 reps → `sets × reps` (5x5); otherwise the top set if ≤ 5 reps → nRM (a 6-rep top set counts as 5RM); anything above 6 reps is dropped; same-day logs of one exercise are merged first; bodyweight exercises are excluded; technique work (top weight under 60 % of the best already reached) is dropped too. Exercise names are mapped/merged in `import.py`.
3. Write a review report (`jefit-import-review.md`) listing every kept session; nothing is loaded before it is approved.
4. Generate an idempotent SQL file (`INSERT … ON CONFLICT DO NOTHING`, entries tagged `source = 'jefit'`) and run it with `wrangler d1 execute --local` first, check the records page, then `--remote`.
5. The raw export and the generated SQL stay **out of git** (personal data), under `/Users/renaud/Repositories/scripts/workout-app/jefit/`.

`log_entry` gets a `source` column (`app` | `jefit`) so the import can be re-run or rolled back cleanly.

## 10. Decisions

- Repo: GitHub, `github.com/Tasmanien/workout-app` (private). Backups go to its `backups` branch, no second repo.
- Login: Cloudflare Access with email one-time code.
- No bodyweight / RPE tracking.
