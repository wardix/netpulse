# Copilot instructions — NetPulse

This file collects repo-specific guidance for Copilot sessions so suggestions, code edits, and automated tasks follow project conventions.

---

## Quick commands

- Install deps: `bun install`
- Start (direct): `bun src/index.ts`  
- Start (via script): `bun run start`  
- Dev (watch): `bun --watch src/index.ts` or `bun run dev`
- Seed DB: `bun run seed` (runs `src/db/seed.ts`)
- Format: `bun run format`  (uses Biome)
- Lint: `bun run lint`  (uses Biome)
- Pre-commit hook: runs `bun run format && bun run lint` (.husky/pre-commit)
- Run test suite: `bun test`  (no tests currently)
- Run a single test file: `bun test path/to/testfile`  (e.g. `bun test tests/my.test.ts`)

> package.json scripts: `start`, `dev`, `seed`, `format`, `lint`, `test` (placeholder), `prepare` (husky)

---

## High-level architecture (big picture)

NetPulse follows a layered architecture. Core layers and responsibilities:

- Controllers (src/controllers): HTTP routes and request/response handling (Hono).
- Services (src/services): Business logic and orchestration (e.g., sync, webhook handling).
- Repositories (src/repositories): Direct DB access using raw SQL via `bun:sqlite`.
- Infrastructure (src/infrastructure): External integrations (MikroTik REST client).
- Models (src/models): TypeScript interfaces.
- DB init (src/db): Creates `routers` and `sessions` tables and indexes.

Entry point: `src/index.ts` constructs repositories, clients, and services (dependency injection), then calls `setupRoutes` (controllers) and starts Bun.serve.

Sync flow (monitor.service): read all routers from `routers` table → call Mikrotik REST endpoint (`/rest/ppp/active?.proplist=name,address,uptime`) → mark router sessions offline then update online sessions in DB.

Webhook flow: MikroTik `ip-up` / `ip-down` scripts call `POST /api/webhook/:router_id/:event`; controllers parse form data (`c.req.parseBody()`) and update session state.

DB: default path is `data/monitor.db` (env var `DB_PATH`), created automatically by `src/db/database.ts`.

---

## Key conventions (repo-specific)

- Bun-first: prefer `bun` commands; do not run Node/npm tooling. See CLAUDE.md/GEMINI.md for full guidance.
- Raw SQL only: repositories use `db.run()` / `db.query()` (no ORM). Use explicit transactions for bulk updates.
- Biome: formatting/linting rules are in `biome.json` (spaces, single quotes, semicolons as-needed). Run `bun run format` and `bun run lint` before commits.
- DB config: read `PORT` and `DB_PATH` from environment. `.env` is auto-loaded by Bun; do not add dotenv.
- Mikrotik client: use basic auth (`btoa(username:password)`) and the optimized `.proplist=name,address,uptime` query for active sessions.
- Webhooks: endpoints include `:router_id` to identify the source router — controllers expect form-urlencoded payloads from MikroTik scripts.
- Multi-router logic: always iterate all routers in the `routers` table for status checks and syncs.
- Pre-commit: Husky configured (`prepare` script); pre-commit runs formatting and linting.
- Tests: none present; when adding tests, follow Bun test patterns and run single test files with `bun test <file>`.

---

## Files & places to inspect for typical tasks

- Entry / wiring: `src/index.ts`
- Sync & webhook logic: `src/services/monitor.service.ts`
- HTTP routes: `src/controllers/api.controller.ts`
- Router fetch logic: `src/infrastructure/mikrotik.client.ts`
- DB schema & init: `src/db/database.ts`
- Repositories: `src/repositories/*.ts`
- Models: `src/models/types.ts`
- Formatting config: `biome.json`
- Project guidelines: `CLAUDE.md`, `GEMINI.md`

---

## Notes for Copilot sessions

- Respect the Bun-first policy and Biome formatting rules embedded in this repo.
- Prefer raw SQL via `bun:sqlite` for DB access; mirror existing repository patterns when adding queries or indexes.
- When proposing CLI instructions or automation, prefer the existing package.json scripts and `bun` invocations.
- Avoid introducing external runtime tools (Express, other DB drivers, ORMs) unless the user explicitly requests them.

---

(See `CLAUDE.md` and `GEMINI.md` at repo root for additional project-level mandates.)
