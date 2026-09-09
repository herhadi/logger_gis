# Migrasi Backend ke NestJS

## Milestone 1

- [x] Pasang dependency NestJS dan TypeScript.
- [x] Buat bootstrap NestJS minimal.
- [x] Tambahkan `GET /health` dengan response framework NestJS.
- [x] Migrasikan koneksi database sebagai provider.
- [x] Migrasikan endpoint read `GET /api/marker`.
- [x] Tambahkan parity test dasar endpoint marker.
- [x] Migrasikan endpoint detail dan CRUD marker.
- [x] Migrasikan endpoint login, logout, dan session.
- [x] Tambahkan parity test auth dan CRUD marker.
- [ ] Jalankan parity test detail dan CRUD marker terhadap database test.
- [x] Migrasikan read polygon dan selection stats.
- [x] Migrasikan detail dan CRUD polygon.
- [x] Tambahkan parity test CRUD polygon.
- [x] Jalankan parity test detail dan CRUD polygon terhadap database test.
- [x] Migrasikan read, option, detail, dan CRUD pipa.
- [x] Tambahkan parity test read pipa.
- [x] Tambahkan parity test detail dan CRUD pipa.
- [x] Jalankan parity test detail dan CRUD pipa terhadap database test.
- [x] Migrasikan webhook, command admin, dan cron Telegram.
- [x] Tambahkan integration test Telegram live yang opt-in.
- [x] Siapkan static frontend dan script runtime NestJS.
- [x] Tambahkan endpoint vector tile marker berbasis PostGIS MVT.
- [x] Tambahkan halaman proof-of-concept MapLibre untuk marker vector tile.
- [x] Tambahkan vector tile pipa dan polygon ke proof-of-concept MapLibre.
- [x] Buat fondasi frontend Next.js terpisah untuk migrasi bertahap.
- [x] Deklarasikan workspace monorepo untuk frontend Next.js.
- [x] Pisahkan template environment backend dan frontend.
- [x] Tambahkan template environment khusus `apps/backend`.
- [x] Pindahkan backend NestJS ke `apps/backend`.
- [x] Pindahkan frontend Next.js ke `apps/frontend`.
- [x] Alihkan Render ke runtime NestJS setelah smoke test deployment.

Test Telegram live (mengirim pesan ke konfigurasi Telegram aktif):

```bash
npm run build:nest
RUN_INTEGRATION_TESTS=1 RUN_NEST_INTEGRATION=1 RUN_TELEGRAM_INTEGRATION=1 NODE_ENV=development npm test
```

Build lokal:

```bash
npm run build:nest
```

Jalankan hasil build:

```bash
npm run start:nest
```

Parity test marker terhadap database:

```bash
npm run build:nest
RUN_INTEGRATION_TESTS=1 RUN_NEST_INTEGRATION=1 NODE_ENV=development npm test
```

Migrasi dilakukan langsung per modul. API Express lama tetap menjadi referensi sampai modul NestJS penggantinya lulus parity test.
