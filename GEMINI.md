# Project Instructions: NetPulse 🌐

This document serves as the foundational mandate for the NetPulse project. All future development and AI-assisted tasks must strictly adhere to these guidelines.

## 🏛 Architecture & Patterns

- **Layered Architecture:** Maintain clear separation of concerns:
    - **Controllers:** Handle HTTP requests/responses (Hono).
    - **Services:** Implement business logic and orchestrate repositories/infrastructure.
    - **Repositories:** Direct data access using **Raw SQL** (no ORM).
    - **Infrastructure:** External integrations (MikroTik REST API client).
    - **Models:** TypeScript interfaces and types.
- **Dependency Injection:** Inject dependencies through constructors to facilitate testing and modularity.

## 🛠 Tech Stack & Tools

- **Runtime:** Bun
- **Framework:** Hono
- **Database:** PostgreSQL via `bun:sql` (primary) with fallback to SQLite via `bun:sqlite`.
- **Formatting & Linting:** Biome (Indent: space, Quote: single, Semicolons: as needed).
- **Communication:** MikroTik REST API (v7+).

## 📝 Coding Standards

- **SQL:** Always use Raw SQL via the `db.query()` and `db.run()` abstraction wrapper (supporting both Postgres and SQLite). Use explicit transactions where necessary.
- **Portability:** Read configuration (Port, DATABASE_URL, DB Path) from environment variables with sensible defaults.
- **Types:** Ensure strict typing for all interfaces and function signatures.
- **Formatting:** Run `bun run format` before finalizing any code changes.

## 🔄 Workflows

- **Multi-Router:** Ensure all status checks and sync tasks iterate through all registered routers in the `routers` table.
- **Sync Logic:** Use the optimized `.proplist=name,address,uptime` query when fetching data from MikroTik.
- **Webhooks:** Webhook endpoints must be dynamic and include a `:router_id` to identify the source.

## 📁 Directory Structure

```text
src/
├── controllers/    # Request & Response handling
├── services/       # Business & Sync logic
├── repositories/   # Raw SQL Database Access
├── infrastructure/ # MikroTik REST API Client
├── models/         # Type definitions
├── db/             # Database connection & initialization
└── index.ts        # Entry point (explicit Bun.serve())
```
