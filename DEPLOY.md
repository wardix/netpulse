# Deployment — NetPulse

This document explains how to deploy NetPulse with PostgreSQL (recommended) or the SQLite fallback.

## Overview

- If `DATABASE_URL` is set, NetPulse uses Bun.SQL to connect to PostgreSQL.
- If `DATABASE_URL` is not set, NetPulse falls back to a local SQLite file at `DB_PATH` (default `data/monitor.db`).
- Tables are created automatically on startup by `src/db/database.ts`.

## Environment

- PORT (default: `3000`)
- DATABASE_URL (optional): e.g. `postgres://user:password@host:5432/dbname`
- DB_PATH (optional): file path for SQLite (default: `data/monitor.db`)

Bun automatically loads `.env` files in the project root; do not use `dotenv`.

## Local Postgres (Docker Compose)

Run a local Postgres for development:

```yaml
version: '3.8'
services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: netpulse
      POSTGRES_PASSWORD: changeme
      POSTGRES_DB: netpulse
    ports:
      - "5432:5432"
    volumes:
      - ./pgdata:/var/lib/postgresql/data
```

Start it and point the app at Postgres:

```sh
docker compose up -d
export DATABASE_URL="postgres://netpulse:changeme@localhost:5432/netpulse"
# install deps (if needed)
bun install
# seed sample routers
bun run seed
# start app
bun run start
```

## Migrating existing SQLite data to Postgres

A simple approach is CSV export/import:

```sh
# export from sqlite
sqlite3 data/monitor.db -header -csv "select * from routers;" > routers.csv
sqlite3 data/monitor.db -header -csv "select * from sessions;" > sessions.csv

# import to Postgres (uses $DATABASE_URL)
psql "$DATABASE_URL" -c "\copy routers (id, base_url, username, password) FROM 'routers.csv' CSV HEADER"
psql "$DATABASE_URL" -c "\copy sessions (id, router_id, username, ip_address, status, last_update, uptime) FROM 'sessions.csv' CSV HEADER"
```

Adjust columns/types as needed. The repository does not include an automated migration tool.

## Production notes

- Use a managed Postgres (set `DATABASE_URL`).
- Backup your database and secure credentials.
- Run the app via a process manager, container, or systemd. Ensure `DATABASE_URL` is available to the process.

## Quick commands

- Seed data: `bun run seed`
- Start: `bun run start` (or `bun src/index.ts`)

---

If you want, a sample Dockerfile or full app-compose can be added — tell me which target (Docker, systemd, or Kubernetes).