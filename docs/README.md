# Dokumentasi GIS Watermeter

Dokumentasi teknis project disimpan di folder ini.

## Dokumen

- [`refactoring.md`](./refactoring.md) — rencana, tahapan, checklist, dan catatan refaktorisasi backend/struktur.
- [`architecture.md`](./architecture.md) — arsitektur monorepo saat ini, deployment, dan pembagian tanggung jawab.
- [`changelog.md`](./changelog.md) — catatan perubahan fitur, refaktor, dan keamanan.
- [`nestjs-migration.md`](./nestjs-migration.md) — status migrasi backend ke NestJS.
- [`frontend-migration.md`](./frontend-migration.md) — inventaris fitur frontend legacy, fitur yang sudah dipindahkan, dan gap parity yang masih perlu ditangani.

## Environment

- Root `.env.example`: template legacy/root.
- `apps/backend/.env.example`: environment backend NestJS.
- `apps/frontend/.env.example`: environment frontend Next.js.
- `.env.test.example`: template test; wajib menggunakan database non-production.

Setiap perubahan refaktor harus memperbarui checklist dan decision log yang relevan.
