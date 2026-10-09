# Arsitektur Project

## Arsitektur saat ini

Repository sedang berada dalam fase migrasi dari frontend HTML/Leaflet dan backend Express legacy ke frontend Next.js/MapLibre dan backend API NestJS. Keduanya tetap berada di repository yang sama tetapi memiliki konfigurasi dan deployment terpisah.

```text
Browser
  │
  ▼
apps/frontend — Next.js + React + MapLibre
  ├── app/                 halaman login, user, admin
  ├── components/map-view.jsx
  ├── components/*-editor-panel.jsx
  ├── components/pipe-legend.jsx
  └── lib/api.js
  │
  │ NEXT_PUBLIC_API_URL
  ▼
apps/backend — NestJS API
  ├── auth/session
  ├── API marker
  ├── API pipa + option
  ├── API polygon + selection stats
  ├── vector tiles
  └── Telegram / monitoring / cron
  │
  ▼
PostgreSQL / PostGIS

Legacy/reference:
  frontend/                 HTML + Leaflet
  backend/                  Express legacy/reference
```

## Deployment dan environment

- Frontend dideploy terpisah, misalnya melalui Vercel.
- Backend API dideploy terpisah, misalnya melalui Render.
- `apps/frontend/.env.example` adalah template environment frontend.
- `apps/backend/.env.example` adalah template environment backend.
- `.env.example` di root dipertahankan sebagai template legacy/root; jangan menganggapnya sebagai template frontend Next.js.
- `.env.test.example` hanya untuk test dan harus memakai database non-production.
- `NEXT_PUBLIC_API_URL` menunjuk ke base URL backend.
- `NEXT_PUBLIC_GEOAPIFY_API_KEY` dipakai oleh pencarian lokasi di browser. Karena awalan `NEXT_PUBLIC_`, key dapat terlihat oleh pengguna; batasi pemakaiannya di dashboard Geoapify.

Jangan commit file environment aktual, token, password, session secret, atau kredensial database.

## Tanggung jawab frontend Next.js

- `apps/frontend/app/`: routing halaman Next.js.
- `apps/frontend/components/map-view.jsx`: inisialisasi MapLibre, layer raster/vector, kontrol peta, pencarian lokasi, pemilihan diameter pipa, dan event peta.
- `apps/frontend/components/marker-editor-panel.jsx`: create/update/delete marker dan tautan navigasi ke Google Maps.
- `apps/frontend/components/pipe-editor-panel.jsx`: create/update/delete pipa.
- `apps/frontend/components/polygon-editor-panel.jsx`: create/update/delete polygon.
- `apps/frontend/components/pipe-legend.jsx`: legenda dan pemicu filter diameter.
- `apps/frontend/lib/api.js`: request ke backend.
- `apps/frontend/app/globals.css`: layout peta, toolbar, editor, dan kontrol responsif.

## Frontend legacy

- `frontend/js/map-core-shared.js`: fondasi map Leaflet dan layer.
- `frontend/js/map-read-shared.js`: loading data, popup, legenda, dan geocoder Geoapify.
- `frontend/js/map-admin-edit-shared.js`: CRUD, edit geometri, dan sinkronisasi pipa yang terhubung ke marker.
- `frontend/js/admin.js`: orchestration admin, statistik area seleksi, kontrol layer, dan helper geometri.
- `frontend/js/user.js`: bootstrap viewer read-only.

Folder legacy tetap berguna sebagai referensi perilaku sampai parity fitur Next.js diverifikasi. Jangan menghapus implementasi legacy hanya karena ada komponen pengganti dengan nama serupa.

## Aturan reuse

- Logic yang dipakai admin dan user sebaiknya tidak diduplikasi.
- Jaga kontrak API, koordinat, dan urutan koordinat secara konsisten.
- Validasi perubahan geometri, relasi endpoint pipa-marker, dan perilaku popup sebelum menyatakan parity selesai.
- Update dokumen migrasi dan changelog ketika ada fitur yang dipindahkan atau gap yang ditutup.
