# Rencana Refaktorisasi

Dokumen ini menjadi catatan kerja utama refaktorisasi GIS Watermeter. Prinsip utamanya adalah perubahan kecil, dapat diverifikasi, dan tidak mengubah kontrak API tanpa keputusan terpisah.

## Tujuan

- Memisahkan tanggung jawab backend tanpa mengubah perilaku endpoint.
- Menjaga logic read lintas role tetap berada di module frontend shared.
- Meningkatkan keamanan konfigurasi dan endpoint operasional.
- Menambahkan baseline pemeriksaan agar regresi mudah diketahui.
- Menghapus dependency dan logic yang tidak digunakan setelah diverifikasi.

## Kondisi Awal — 2026-08-07

- `backend/server.prod.js`: sekitar 1.173 baris; memuat konfigurasi app, session, auth, CRUD GIS, Telegram, cron, dan static serving.
- `frontend/js/admin.js`: sekitar 1.110 baris.
- `frontend/js/map-admin-edit-shared.js`: sekitar 1.330 baris.
- Belum tersedia test otomatis di `package.json`.
- Dependency yang perlu diverifikasi pemakaiannya: `axios`, `express-mysql-session`, `multer`, dan `mysql2`.
- Endpoint operasional/testing Telegram perlu diaudit dan dilindungi di production.
- `SESSION_SECRET` memiliki fallback default; target refaktor adalah mewajibkan secret melalui environment.
- README dan konfigurasi server perlu disamakan mengenai port default.

## Aturan Kerja

1. Jangan mengubah response, status code, nama endpoint, atau format data API dalam refaktor struktural.
2. Satu perubahan domain per commit/per tahap jika memungkinkan.
3. Sebelum memindahkan logic, pastikan route dan query yang dipindahkan sudah teridentifikasi lengkap.
4. Semua query SQL tetap parameterized.
5. Nama tabel dinamis hanya boleh berasal dari whitelist.
6. Perubahan read lintas role masuk ke module shared frontend.
7. Fungsi yang berpotensi dipakai lintas modul harus memiliki satu implementasi di shared utility/module.
8. Jangan membuat fungsi global baru jika module bersama sudah cukup; global hanya sebagai facade kompatibilitas yang jelas.
9. Setelah setiap tahap, jalankan syntax check dan smoke test yang relevan.
10. Jangan memasukkan `.env`, token, private key, atau data production ke dokumentasi.

## Tahapan

### Fase 0 — Baseline dan inventarisasi

- [x] Inventarisasi file, ukuran module, route, dan dependency.
- [ ] Jalankan seluruh syntax check.
- [ ] Catat response/status penting endpoint auth dan GIS.
- [ ] Tambahkan smoke test minimal untuk login, session, pipa, polygon, dan marker.
- [ ] Periksa `.gitignore` dan secret yang terlacak.

### Fase 1 — Keamanan dan konfigurasi

- [x] Buat module konfigurasi environment.
- [x] Hilangkan fallback `SESSION_SECRET`.
- [x] Batasi konfigurasi CORS sesuai deployment.
- [x] Tambahkan error handler terpusat.
- [x] Lindungi endpoint testing/webhook Telegram dengan admin session.
- [x] Lindungi endpoint cron dengan `X-Cron-Secret`.
- [x] Error handler tidak mengirim detail error internal ke client production.

### Fase 2 — Ekstraksi backend per domain

Urutan yang disarankan: marker, polygon, pipa, auth, lalu Telegram/monitoring.

- [ ] Ekstrak route marker ke `backend/routes/marker.js`.
- [x] Ekstrak endpoint `GET /api/marker` ke `backend/routes/marker.js`.
- [x] Ekstrak endpoint `GET /api/marker/:tipe/:id` ke `backend/routes/marker.js`.
- [x] Ekstrak endpoint `POST /api/marker/create` ke `backend/routes/marker.js`.
- [x] Ekstrak endpoint `PUT /api/marker/update/:tipe/:id` ke `backend/routes/marker.js`.
- [x] Ekstrak endpoint `DELETE /api/marker/delete/:tipe/:id` ke `backend/routes/marker.js`.
- [x] Ekstrak whitelist dan validasi koordinat marker ke `backend/utils/marker.js`.
- [x] Tambahkan unit test untuk utility marker.
- [x] Pusatkan query union marker berdasarkan whitelist.
- [x] Ekstrak validasi dan konversi geometry umum ke `backend/utils/geometry.js`.
- [ ] Ekstrak route polygon.
- [ ] Ekstrak route pipa.
- [ ] Ekstrak auth/session middleware.
- [ ] Ekstrak Telegram dan monitoring.
- [ ] Pastikan route spesifik `/api/pipa/option` tetap dideklarasikan sebelum `/api/pipa/:id`.

Target struktur backend:

```text
backend/
├── app.js
├── db.js
├── middleware/auth.js
├── routes/auth.js
├── routes/pipa.js
├── routes/polygon.js
├── routes/marker.js
├── routes/telegram.js
├── services/pipa-service.js
├── services/polygon-service.js
├── services/marker-service.js
└── utils/validation.js
```

### Fase 3 — Validasi dan kontrak API

- [ ] Validasi `id`, `bbox`, `zoom`, koordinat, dan tipe marker.
- [ ] Standarkan format response error.
- [ ] Dokumentasikan kontrak endpoint yang benar-benar digunakan frontend.
- [ ] Tambahkan test untuk input invalid, unauthorized, not found, dan route collision.

### Fase 4 — Frontend

- [ ] Buat API client/fetch wrapper bersama.
- [ ] Inventarisasi fungsi duplikat dan pindahkan fungsi reusable ke `utils.js` atau module shared yang sesuai.
- [ ] Jika perlu akses lintas script browser, expose satu namespace global yang terdokumentasi, bukan banyak fungsi global terpisah.
- [ ] Kurangi ketergantungan pada `window.*` secara bertahap.
- [ ] Pindahkan inline `onclick` ke event listener.
- [ ] Pisahkan state map, loading layer, popup, dan event handler bila diperlukan.
- [ ] Pertahankan read logic pada `map-read-shared.js` dan fondasi pada `map-core-shared.js`.

### Fase 5 — Hygiene dan dokumentasi

- [ ] Hapus dependency yang terbukti tidak digunakan.
- [ ] Tambahkan script `check`, `lint`, dan `test`.
- [ ] Samakan README, `render.yaml`, dan konfigurasi runtime.
- [ ] Perbarui dokumen arsitektur setelah setiap ekstraksi besar.

## Pemeriksaan Minimum

```bash
node --check backend/server.prod.js
node --check frontend/js/admin.js
node --check frontend/js/user.js
node --check frontend/js/map-core-shared.js
node --check frontend/js/map-read-shared.js
node --check frontend/js/map-admin-edit-shared.js
git diff --check
```

## Definition of Done

- Semua syntax check lulus.
- Smoke test endpoint terkait lulus.
- Tidak ada route collision baru.
- Tidak ada perubahan kontrak API yang tidak didokumentasikan.
- Secret tidak masuk repository.
- Checklist fase dan decision log diperbarui.
- `docs/changelog.md` diperbarui untuk perubahan yang terlihat oleh developer/user.

## Decision Log

| Tanggal | Keputusan | Alasan |
|---|---|---|
| 2026-08-07 | Mendokumentasikan tahapan refaktor di `docs/` | Refaktor dilakukan bertahap dan perlu jejak keputusan serta verifikasi. |
| 2026-08-07 | Memulai dari baseline, keamanan, lalu ekstraksi backend | Backend adalah titik konsentrasi risiko dan belum memiliki test otomatis. |
| 2026-08-07 | Ekstraksi domain dimulai dari marker | Scope lebih kecil dan cocok sebagai perubahan struktural pertama. |
