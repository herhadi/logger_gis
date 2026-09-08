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
- [ ] Jalankan parity test detail dan CRUD polygon terhadap database test.
- [x] Migrasikan read, option, detail, dan CRUD pipa.
- [x] Tambahkan parity test read pipa.
- [x] Tambahkan parity test detail dan CRUD pipa.
- [ ] Jalankan parity test detail dan CRUD pipa terhadap database test.

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
