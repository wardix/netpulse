# PPPoE Online Monitor API Plan (Bun + Hono + Layered)

## Objective
Membangun layanan API (Backend) menggunakan Bun dan Hono untuk memantau status PPPoE MikroTik via REST API, serta menyediakan webhook untuk script `ip-up` dan `ip-down`.

## Tech Stack
- **Runtime:** Bun
- **Framework:** Hono
- **Database:** SQLite (Built-in `bun:sqlite`)
- **SQL Approach:** Raw SQL (Tanpa ORM, performa maksimal)
- **MikroTik Integration:** Native Fetch (MikroTik REST API)

## Fitur Utama
1. **Status Checker:** `GET /api/status/:ip` -> Cek status IP dari database.
2. **Bulk Status Checker:** `POST /api/status/bulk` -> Cek status banyak IP sekaligus.
3. **Webhook ip-up/down:** `POST /api/webhook/:router_id/up` -> Update status dengan identitas router.
4. **List Online:** `GET /api/online` -> Daftar pelanggan online dari semua router.
5. **Sync Task:** `GET /api/sync` -> Paksa sinkronisasi massal dari semua router yang terdaftar.

## Rincian Implementasi (Layered Architecture)

### 1. Struktur Folder
```text
/
├── src/
│   ├── controllers/      # Request & Response handling
│   │   ├── session.controller.ts
│   │   ├── router.controller.ts
│   │   └── webhook.controller.ts
│   ├── services/         # Logika Bisnis & Sync logic
│   │   ├── monitor.service.ts
│   │   └── router.service.ts
│   ├── repositories/      # Akses Database (Raw SQL via bun:sqlite)
│   │   ├── session.repository.ts
│   │   └── router.repository.ts
│   ├── infrastructure/   # MikroTik REST API Client
│   │   └── mikrotik.client.ts
│   ├── models/           # Type definitions
│   │   └── types.ts
│   ├── db/               # SQLite Initialization
│   │   └── database.ts
│   └── index.ts          # Entry Point
├── data/
│   └── monitor.db
├── package.json
└── README.md
```

### 2. Tanggung Jawab Tiap Layer
- **Controller Layer:** Menerima input dan mengembalikan response.
- **Service Layer:** Mengelola alur data antar repository dan integrasi external.
- **Repository Layer:** Eksekusi **Raw SQL** murni menggunakan `db.prepare(sql).all()` atau `.run()`.
- **Infrastructure Layer:** Melakukan HTTP Fetch ke MikroTik REST API.

### 3. Skema Database (SQLite)
Tabel `routers`:
- `id`: TEXT PRIMARY KEY
- `host`: TEXT
- `port`: INTEGER
- `username`: TEXT
- `password`: TEXT

Tabel `sessions`:
- `id`: INTEGER PRIMARY KEY AUTOINCREMENT
- `router_id`: TEXT
- `username`: TEXT
- `ip_address`: TEXT
- `status`: TEXT ('online'/'offline')
- `last_update`: DATETIME DEFAULT CURRENT_TIMESTAMP
- `uptime`: TEXT

### 4. Integrasi Script MikroTik (PPP Profiles)
**Script ip-up:**
```routeros
/tool fetch url="http://<SERVER_IP>:3000/api/webhook/ROUTER_ID/up" http-method=post http-data="user=$"user"&ip=$"remote-address""
```

**Script ip-down:**
```routeros
/tool fetch url="http://<SERVER_IP>:3000/api/webhook/ROUTER_ID/down" http-method=post http-data="user=$"user"&ip=$"remote-address""
```
