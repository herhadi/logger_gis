# Changelog

Catatan perubahan project GIS Watermeter. Gunakan format tanggal `YYYY-MM-DD` dan kelompokkan perubahan berdasarkan kategori.

## [1.1.0-nestjs] - 2026-09-08

### Added

- Menambahkan modul NestJS untuk auth/session, marker, polygon, pipa, dan Telegram.
- Menambahkan parity test integration untuk endpoint GIS dan operasi Telegram live.
- Menambahkan penyajian frontend statis dari runtime NestJS.

### Changed

- Menambahkan cache tile in-memory berbatas (TTL 5 menit, maksimum 500 tile) agar request tile berulang tidak selalu membaca Neon.
- Mengaktifkan `ValidationPipe` global NestJS dengan transform, whitelist, dan penolakan field tidak dikenal sebagai gerbang validasi request.
- Memindahkan smoke/integration test NestJS ke `apps/backend/test` dan menambahkan verifikasi health, validasi payload, serta response vector tile.
- Menambahkan script `npm test` backend sebagai runner smoke test lokal tanpa database.
- Memisahkan test database/tile dengan flag `RUN_NEST_DB_INTEGRATION` agar limit Neon tidak menggagalkan smoke test NestJS.
- Mengalihkan runtime Render dari Express ke NestJS.
- Menambahkan build dependency development pada proses build Render.
- Menambahkan smoke test production untuk health, frontend, dan endpoint marker.

### Verification

- Integration test production: lulus.
- Smoke test Render: `/health` dan `/login.html` merespons `200`.
- Response health mengidentifikasi framework sebagai NestJS.

## [Unreleased]

### Changed

- Memperpanjang cache HTTP tile marker, pipa, dan polygon menjadi 30 menit dengan stale-while-revalidate untuk mengurangi transfer Neon.
- Menghapus cache-busting `refresh=Date.now()` pada refresh tile frontend agar tile dapat digunakan kembali dari cache.
- Mendokumentasikan command build dan start backend NestJS dari `apps/backend`.
- Memindahkan dependency dan lockfile backend ke `apps/backend` agar monorepo tidak bergantung pada package root legacy.
- Memvalidasi dependency frontend mandiri di `apps/frontend`; production build berhasil dan audit menemukan 0 vulnerability.
- Menetapkan `outputFileTracingRoot` frontend ke folder `apps/frontend` untuk menghindari deteksi lockfile legacy root.
- Menambahkan dokumentasi refaktorisasi dan arsitektur di folder `docs/`.
- Menetapkan aturan bahwa logic yang berpotensi dipakai lintas modul harus memiliki satu implementasi bersama.
- Memusatkan whitelist tabel dan validasi koordinat marker di utility backend bersama.
- Menambahkan unit test untuk validasi utility marker.
- Memusatkan validasi dan konversi geometry line/polygon di utility backend bersama.
- Memusatkan pembentukan query union marker berdasarkan whitelist tabel.

### Refactoring

- Menetapkan milestone terpisah untuk ekstraksi utility marker dan ekstraksi route marker.
- Memindahkan endpoint `GET /api/marker` ke router marker terpisah.
- Memindahkan endpoint detail marker ke router marker terpisah.
- Memindahkan endpoint create marker ke router marker terpisah.
- Memindahkan endpoint update dan delete marker ke router marker terpisah.
- Menambahkan router polygon untuk list, detail, create, update, dan delete.
- Menghapus route polygon legacy dari server utama dan memindahkan statistik seleksi ke router khusus.
- Memindahkan seluruh route pipa ke router pipa terpisah.
- Menambahkan test registrasi route untuk mendeteksi collision dasar.
- Memindahkan endpoint auth/session ke router auth terpisah.
- Menambahkan test registrasi route auth.
- Memindahkan webhook Telegram dan monitoring/cron ke router Telegram terpisah.
- Menambahkan test registrasi route Telegram.
- Memusatkan middleware login, admin, dan cron secret.
- Menambahkan unit test untuk middleware keamanan.
- Memisahkan app factory Express dari entrypoint production agar dapat diuji tanpa `listen()`.
- Menambahkan injection point untuk database pool dan session store pada app factory.
- Menambahkan guard untuk integration test database.
- Menambahkan integration test HTTP read-only berbasis `supertest`.
- Memperluas integration test untuk filter GIS dan statistik seleksi.
- Menambahkan CRUD integration test opt-in dengan cleanup otomatis.
- Menambahkan mode integration test login-only.
- Mendokumentasikan cara menjalankan seluruh kategori test.
- Memulai scaffold backend NestJS dengan health endpoint.
- Menambahkan provider PostgreSQL dan modul read marker di NestJS.
- Menambahkan parity test dasar endpoint marker Express dan NestJS.
- Menambahkan session guard serta detail/CRUD marker pada NestJS.
- Menambahkan auth/session dasar pada NestJS.
- Menambahkan parity test auth dan CRUD marker NestJS.
- Menambahkan template `.env.test.example` untuk integration test staging.
- Menambahkan `CRON_SECRET` dan `BASE_URL` ke konfigurasi Render.
- Memperbarui dependency transitif melalui `npm audit fix`; hasil audit menjadi 0 vulnerability.
- Menambahkan `GET /health` dan konfigurasi health check Render.
- Menambahkan smoke test read-only untuk route deployment Render.

### Security

- Menambahkan konfigurasi environment terpusat.
- Menghilangkan fallback secret session di production.
- Membatasi endpoint operasional Telegram dan cron.

## [2026-08-07]

### Documentation

- Menambahkan baseline kondisi project dan tahapan refaktorisasi.
- Menambahkan decision log dan checklist verifikasi.
