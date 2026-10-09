# Changelog

Catatan perubahan project GIS Watermeter. Gunakan format tanggal `YYYY-MM-DD` dan kelompokkan perubahan berdasarkan kategori.

## [Unreleased]

### Added

- Menambahkan tool analisis area di frontend Next.js: menggambar area terpisah dari editor polygon, menghitung perkiraan luas hektare, dan menampilkan statistik point/line/polygon dari endpoint `/api/selection/stats`.

### Documentation

- Memperbarui audit migrasi frontend dan checklist pengujian statistik area; pengujian browser masih tertunda.

### Changed

- Memperjelas template `apps/frontend/.env.example` untuk pencarian Geoapify, termasuk placeholder key dan catatan bahwa variabel `NEXT_PUBLIC_*` terlihat oleh browser.
- Menetapkan rentang Node.js frontend ke `24.x` agar sesuai dengan pilihan runtime Vercel.
- Memperbarui audit migrasi frontend untuk mencatat gap parity, konfigurasi deployment, dan pengujian yang masih dibutuhkan.

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
- Menambahkan `LoginDto` dan unit test validasi login/session guard tanpa database.
- Menambahkan integration test login, session, dan logout yang hanya aktif dengan database flag.
- Memisahkan test database/tile dengan flag `RUN_NEST_DB_INTEGRATION` agar limit Neon tidak menggagalkan smoke test NestJS.
- Mengalihkan runtime Render dari Express ke NestJS.
- Menambahkan build dependency development pada proses build Render.
- Menambahkan smoke test production untuk health, frontend, dan endpoint marker.

### Verification

- Integration test production: lulus.
- Smoke test Render: `/health` dan `/login.html` merespons `200`.
- Response health mengidentifikasi framework sebagai NestJS.

## [Unreleased — historis]

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
- Memindahkan endpoint marker, polygon, pipa, auth/session, webhook Telegram, monitoring, dan cron ke modul/router terpisah.
- Menambahkan test registrasi route untuk mendeteksi collision dasar.
- Memusatkan middleware login, admin, dan cron secret.
- Memisahkan app factory Express dari entrypoint production agar dapat diuji tanpa `listen()`.
- Menambahkan injection point untuk database pool dan session store pada app factory.
- Menambahkan guard dan integration test untuk database.
- Memulai scaffold backend NestJS dengan health endpoint, provider PostgreSQL, dan modul marker.
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
