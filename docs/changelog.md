# Changelog

Catatan perubahan project GIS Watermeter. Gunakan format tanggal `YYYY-MM-DD` dan kelompokkan perubahan berdasarkan kategori.

## [Unreleased]

### Changed

- Menambahkan dokumentasi refaktorisasi dan arsitektur di folder `docs/`.
- Menetapkan aturan bahwa logic yang berpotensi dipakai lintas modul harus memiliki satu implementasi bersama.
- Memusatkan whitelist tabel dan validasi koordinat marker di utility backend bersama.
- Menambahkan unit test untuk validasi utility marker.
- Memusatkan validasi dan konversi geometry line/polygon di utility backend bersama.

### Refactoring

- Menetapkan milestone terpisah untuk ekstraksi utility marker dan ekstraksi route marker.

### Security

- Menambahkan konfigurasi environment terpusat.
- Menghilangkan fallback secret session di production.
- Membatasi endpoint operasional Telegram dan cron.

## [2026-08-07]

### Documentation

- Menambahkan baseline kondisi project dan tahapan refaktorisasi.
- Menambahkan decision log dan checklist verifikasi.
