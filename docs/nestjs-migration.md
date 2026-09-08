# Migrasi Backend ke NestJS

## Milestone 1

- [x] Pasang dependency NestJS dan TypeScript.
- [x] Buat bootstrap NestJS minimal.
- [x] Tambahkan `GET /health` dengan response framework NestJS.
- [x] Migrasikan koneksi database sebagai provider.
- [x] Migrasikan endpoint read `GET /api/marker`.
- [x] Tambahkan parity test dasar endpoint marker.
- [ ] Migrasikan endpoint detail dan CRUD marker.

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
