# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/db run apply-account-rls` — apply the checked-in PostgreSQL row-level security migration
- Required env: `DATABASE_URL` — Postgres connection string

## Release security gate

- Production releases must require the GitHub Actions check **Real Clerk account isolation** from `.github/workflows/release-gate.yml` in the repository's branch protection or ruleset.
- The check runs the real Clerk account-isolation test when `CLERK_SECRET_KEY` is available. Pushes to `main` and manual release runs fail closed when that secret is missing, so a skipped security test cannot authorize production deployment.
- Fork and untrusted pull requests do not receive repository secrets and are allowed to complete safely without running the real test. They never use placeholder credentials.
- Configure `CLERK_SECRET_KEY` and `DATABASE_URL` as repository Actions secrets; do not put credentials in this file or the workflow.

### Configuring the branch ruleset (one-time, on GitHub)

1. Go to **Settings → Rules → Rulesets** in the repository.
2. Create a new ruleset targeting the `main` branch (or edit the existing one).
3. Under **Require status checks to pass**, add:
   - Status check name: `Real Clerk account isolation`
   - Require branches to be up to date before merging: enabled
4. Save. This ensures no merge or direct push to `main` can succeed unless the workflow job named `Real Clerk account isolation` has passed.

### Dry-run verification

Run `pnpm --filter @workspace/api-server run test:dry-run-gate` (via `artifacts/api-server/scripts/dry-run-release-gate.ts`) to confirm the conditional logic without using live credentials.

Verified scenarios (2026-08-21):

| Scenario | CLERK_SECRET_KEY | Exit code | Meaning |
|---|---|---|---|
| `GITHUB_EVENT_NAME=push` | absent | **1** | Production push blocked — fail closed ✓ |
| `GITHUB_EVENT_NAME=pull_request` | absent | **0** | Fork PR allowed to complete safely ✓ |
| `GITHUB_EVENT_NAME=push` | present | **0** | Gate proceeds to real `test:real-auth` run ✓ |

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

- Tasks and notebook items use PostgreSQL row-level security keyed by the transaction-local `app.current_account_id` setting. API queries set that value through `withAccount`, so pooled connections never retain an account identity.
- The RLS migration is kept as explicit SQL because Drizzle schema push can create the policy shell but does not reliably preserve these raw PostgreSQL expressions. Run it after schema push and during deployment migrations.

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- The API database role must not be a PostgreSQL superuser or table owner; those roles bypass RLS. RLS is forced on both account-owned tables, and the API must always query through an account transaction.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
