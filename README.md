# NetPulse 🌐

**NetPulse** adalah layanan API monitoring terpusat untuk memantau status online/offline pelanggan PPPoE dari berbagai router MikroTik secara real-time. Dibangun menggunakan **Bun**, **Hono**, dan **SQLite** dengan arsitektur yang ringan dan performa tinggi.

## ✨ Fitur Utama
- **Multi-Router Support:** Pantau banyak MikroTik PPPoE Server dari satu dashboard API.
- **Real-time Webhooks:** Integrasi langsung dengan script `ip-up` dan `ip-down` MikroTik.
- **Bulk Status Check:** Cek status ratusan IP pelanggan dalam satu kali request.
- **Auto-Sync:** Sinkronisasi massal database dengan status real-time router via REST API.
- **High Performance:** Menggunakan Bun SQL murni (Raw SQL) untuk akses database super cepat.

## ⚙️ Konfigurasi Environment

Buat file `.env` di root direktori atau salin dari `.env.example`:
```env
PORT=3000
DB_PATH=data/monitor.db
```

## 🚀 Instalasi & Menjalankan

1. **Clone & Install:**
   ```bash
   bun install
   ```

2. **Seed Data (Opsional):**
   Gunakan script seed untuk mengisi data router sampel:
   ```bash
   bun run seed
   ```

3. **Jalankan Server:**
   - **Mode Produksi:** `bun run start`
   - **Mode Development:** `bun run dev`

Server akan berjalan di port yang ditentukan (default: `3000`).

## 🛠️ Pengembangan

Proyek ini menggunakan **Biome** untuk pemformatan dan linting kode, serta **Husky** untuk validasi pre-commit.

- **Format Kode:** `bun run format`
- **Linting:** `bun run lint`

## 📡 Konfigurasi MikroTik

Daftarkan router Anda ke NetPulse melalui API:
```bash
curl -X POST http://localhost:3000/api/routers \
  -H "Content-Type: application/json" \
  -d '{
    "id": "Mikrotik-Pusat",
    "base_url": "http://192.168.88.1",
    "username": "admin",
    "password": "yourpassword"
  }'
```

### Integrasi Script (PPP Profiles)
Pasang script berikut pada **PPP Profile** di MikroTik Anda (Tab Scripts):

**On Up:**
```routeros
/tool fetch url="http://<SERVER_IP>:3000/api/webhook/Mikrotik-Pusat/up" http-method=post http-data="user=$"user"&ip=$"remote-address"" keep-result=no
```

**On Down:**
```routeros
/tool fetch url="http://<SERVER_IP>:3000/api/webhook/Mikrotik-Pusat/down" http-method=post http-data="user=$"user"&ip=$"remote-address"" keep-result=no
```

## 📖 API Documentation

| Endpoint | Method | Deskripsi |
| :--- | :--- | :--- |
| `/api/status/:ip` | `GET` | Cek status satu IP (Online/Offline) |
| `/api/status/bulk` | `POST` | Cek banyak IP sekaligus (Body: `{"ips": ["..."]}`) |
| `/api/online` | `GET` | Daftar semua pelanggan yang sedang online |
| `/api/sync` | `GET` | Paksa sinkronisasi ulang dengan seluruh router |
| `/api/routers` | `GET/POST` | Manajemen daftar router MikroTik |

## 🏗️ Layered Architecture
```text
src/
├── controllers/    # API Routes & HTTP Logic
├── services/       # Business & Sync Logic
├── repositories/   # Raw SQL Database Access
├── infrastructure/ # MikroTik REST Client
├── db/             # SQLite Initialization
└── models/         # TypeScript Interfaces
```

---
Dibuat dengan ❤️ menggunakan [Bun](https://bun.sh) dan [Hono](https://hono.dev).
