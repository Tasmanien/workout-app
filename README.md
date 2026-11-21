# Lift Log

Personal weightlifting records: 1RM / 3RM / 5x5… for single lifts and complexes. Mobile-first PWA, dark theme.

- **Frontend:** React + Vite + Tailwind (`src/client`), installable as a PWA.
- **API:** Cloudflare Worker with Hono (`src/worker`), under `/api`.
- **Database:** Cloudflare D1 (`lift-log`), schema in `migrations/`.
- **Auth:** Cloudflare Access in front of the Worker; the Worker also verifies the Access JWT (`src/worker/auth.ts`).
- **Backups:** D1 Time Travel (7 days) + nightly SQL dump committed to the `backups` branch (`.github/workflows/backup.yml`).

Records only come from session types meant for it: a `max` session (nRM) counts its heaviest successful set with at least n reps, a `fixed` session (sets × reps) counts its lightest set when every set was completed. Hidden session types (e.g. 3x5, 4x5 from the JEFIT history) still count towards the visible ones but are not shown or offered when logging. A result also counts for every smaller target it covers (a 3RM at 60 kg is a 1RM of at least 60 kg; a 5x5 covers 3x3, 5RM, 1RM…), never extrapolated upwards.

## Run locally

```sh
npm install
echo AUTH_DISABLED=true > .dev.vars
npm run db:migrate:local
npm run dev
```

## Deploy

```sh
npm run db:migrate:remote   # when migrations/ changed
npm run deploy
```

`ACCESS_TEAM_DOMAIN` and `ACCESS_AUD` in `wrangler.jsonc` must match the Cloudflare Access application protecting the Worker; without them the API answers 503.

## Backups

The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (permission: Account › D1 › Edit) and `CLOUDFLARE_ACCOUNT_ID`.

Restore a dump into a fresh database:

```sh
npx wrangler d1 execute lift-log --remote --file lift-log.sql
```

## JEFIT import (one-time)

`scripts/jefit-import/import.py <export.csv> --out <dir>` writes a review report; add `--sql` to also write `import.sql`, then load it with `npx wrangler d1 execute lift-log --local|--remote --file <dir>/import.sql`. The export and generated files hold personal data and stay out of git.
