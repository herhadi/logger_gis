# GIS Watermeter

Backend Node.js + PostgreSQL/PostGIS untuk data GIS watermeter, dengan frontend Leaflet untuk melihat dan mengelola layer pipa, polygon, dan marker. Aplikasi memiliki dua mode utama:

- **Admin**: melihat data GIS dan melakukan create, update, delete.
- **User**: melihat data GIS dalam mode read-only.

## Fitur Utama

- Login berbasis session dengan penyimpanan session di PostgreSQL.
- Peta interaktif berbasis Leaflet.
- Layer pipa, polygon, dan marker dengan lazy loading berdasarkan viewport.
- Dukungan parameter `bbox` dan `zoom` untuk mengurangi payload geometri.
- Mode edit admin menggunakan Leaflet Geoman/Draw.
- Statistik area seleksi untuk menghitung objek titik, garis, dan polygon.
- Integrasi Telegram bot untuk monitoring logger dan notifikasi.
- Deploy-ready untuk Render.

## Tech Stack

- Node.js 20
- Express 5
- PostgreSQL + PostGIS
- `pg` connection pool
- `express-session` + `connect-pg-simple`
- Leaflet, Leaflet Draw, Leaflet Geoman, MarkerCluster
- Bootstrap 5
- Telegram Bot API

## Struktur Project

```text
.
├── backend/
│   ├── db.js                 # Pool koneksi PostgreSQL
│   └── server.prod.js        # API, auth/session, cron, webhook, static serving
├── frontend/
│   ├── admin.html            # Halaman admin
│   ├── user.html             # Halaman user read-only
│   ├── login.html            # Halaman login
│   ├── css/
│   └── js/
│       ├── admin.js                  # Orchestration mode admin
│       ├── user.js                   # Bootstrap mode user
│       ├── map-core-shared.js        # Fondasi map bersama
│       ├── map-read-shared.js        # Engine baca layer bersama
│       ├── map-admin-edit-shared.js  # Capability edit admin
│       └── utils.js
├── package.json
└── render.yaml
```

## Prasyarat

- Node.js `>=20 <21`
- Database PostgreSQL dengan ekstensi PostGIS
- Tabel GIS dan tabel pendukung sudah tersedia di database
- File `.env` lokal berisi konfigurasi yang diperlukan

## Environment Variables

Buat file `.env` di root project untuk development lokal:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DATABASE
SESSION_SECRET=isi-dengan-secret-yang-kuat
TELEGRAM_TOKEN=token-bot-telegram
ADMIN_ID=chat-id-admin-telegram
NODE_ENV=development
```

Untuk production di Render, set minimal variable berikut:

- `DATABASE_URL`
- `SESSION_SECRET`
- `TELEGRAM_TOKEN`
- `ADMIN_ID`
- `NODE_ENV=production`

Jangan commit file `.env`, token, private key, atau secret lain.

## Instalasi Lokal

```bash
npm install
```

Jalankan server:

```bash
npm start
```

Secara default server berjalan di port yang ditentukan environment `PORT`, atau `3000` jika tidak ada.

Buka aplikasi:

- Login: `http://localhost:3000/login.html`
- Admin: `http://localhost:3000/admin.html`
- User: `http://localhost:3000/user.html`

## Database

Aplikasi membaca dan menulis ke beberapa tabel utama:

- `users`
- `session`
- `gis_pipa`
- `gis_srpolygon`
- `gis_acc`
- `gis_reservoir`
- `gis_tank`
- `gis_valve`
- `logger_lokasi`
- `logger_latest`
- `notif_telegram`
- `notif_status`

Catatan:

- Tabel `session` harus tersedia karena session disimpan menggunakan `connect-pg-simple`.
- Kolom geometri diasumsikan menggunakan SRID `4326`.
- Endpoint pipa dan polygon memakai fungsi PostGIS seperti `ST_AsGeoJSON`, `ST_FlipCoordinates`, `ST_SimplifyPreserveTopology`, `ST_MakeEnvelope`, dan `ST_Area`.

## Endpoint Penting

### Auth

- `POST /api/login`
- `POST /api/logout`
- `GET /api/session`

### Pipa

- `GET /api/pipa?bbox=south,west,north,east&zoom=13`
- `GET /api/pipa/option`
- `GET /api/pipa/:id`
- `POST /api/pipa/create`
- `PUT /api/pipa/update/:id`
- `DELETE /api/pipa/delete/:id`

### Polygon

- `GET /api/polygon?bbox=south,west,north,east&zoom=13`
- `GET /api/polygon/:id`
- `POST /api/polygon/create`
- `PUT /api/polygon/update/:id`
- `DELETE /api/polygon/delete/:id`

### Marker

- `GET /api/marker?bbox=west,south,east,north`
- `GET /api/marker/:tipe/:id`
- `POST /api/marker/create`
- `PUT /api/marker/update/:tipe/:id`
- `DELETE /api/marker/delete/:tipe/:id`

Tipe marker yang didukung:

- `acc`
- `reservoir`
- `tank`
- `valve`

### Seleksi Area

- `POST /api/selection/stats`

### Telegram

- `POST /webhook`
- `GET /api/test-telegram`
- `GET /api/test-monitor`
- `GET /api/set-webhook`
- `GET /api/webhook-info`
- `GET /api/delete-webhook`
- `GET /api/cron`

## Arsitektur Frontend

Project ini memisahkan logic frontend berdasarkan tanggung jawab:

- `map-core-shared.js`: setup map, base layer, renderer, dan fondasi umum.
- `map-read-shared.js`: load data layer, popup detail, legend, dan optimasi read/view.
- `map-admin-edit-shared.js`: logic edit khusus admin.
- `admin.js`: orchestration admin.
- `user.js`: bootstrap viewer read-only.

Jika perubahan berlaku untuk admin dan user, letakkan logic di module shared, bukan menggandakan logic di `admin.js` dan `user.js`.

## Deploy ke Render

Project sudah menyediakan `render.yaml`:

```yaml
buildCommand: npm install
startCommand: npm start
runtime: node
region: singapore
```

Langkah umum:

1. Push repository ke Git provider.
2. Buat web service di Render dari repository tersebut.
3. Pastikan environment variables sudah diisi.
4. Deploy service.

Untuk Telegram webhook, endpoint webhook biasanya diarahkan ke:

```text
https://DOMAIN-RENDER/webhook
```

## Pemeriksaan Sebelum Commit/Deploy

Jalankan syntax check minimal:

```bash
node --check backend/server.prod.js
node --check frontend/js/admin.js
node --check frontend/js/user.js
node --check frontend/js/map-core-shared.js
node --check frontend/js/map-read-shared.js
node --check frontend/js/map-admin-edit-shared.js
```

## Catatan Development

- Semua query SQL harus menggunakan parameterized query (`$1`, `$2`, ...).
- Untuk nama tabel dinamis, gunakan whitelist.
- Endpoint khusus seperti `/api/pipa/option` harus dideklarasikan sebelum `/api/pipa/:id` agar tidak terjadi route collision.
- Jangan membandingkan kolom boolean PostgreSQL dengan integer `0/1`; gunakan `TRUE`, `FALSE`, atau `COALESCE(..., FALSE)`.
- Jangan commit `node_modules`, `.env`, private key, token, atau file sensitif.

## License

ISC
