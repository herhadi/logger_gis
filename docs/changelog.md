# Changelog

Catatan perubahan project GIS Watermeter. Gunakan format tanggal `YYYY-MM-DD` dan kelompokkan perubahan berdasarkan kategori.

## [Unreleased]

### Changed

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
