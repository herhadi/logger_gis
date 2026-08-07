# Arsitektur Project

## Kondisi saat ini

```text
Frontend HTML
  ├── user.js
  ├── admin.js
  ├── map-core-shared.js
  ├── map-read-shared.js
  └── map-admin-edit-shared.js
          │
          ▼
backend/server.prod.js
  ├── auth/session
  ├── API pipa
  ├── API polygon
  ├── API marker
  ├── selection stats
  ├── Telegram webhook
  ├── monitoring/cron
  └── static files
          │
          ▼
     PostgreSQL/PostGIS
```

## Target bertahap

```text
Frontend
  ├── role orchestration
  ├── shared map core/read
  ├── admin edit capability
  └── API client
          │
          ▼
Express app
  ├── middleware
  ├── routes/auth
  ├── routes/pipa
  ├── routes/polygon
  ├── routes/marker
  └── routes/telegram
          │
          ▼
Services + validation + db
          │
          ▼
PostgreSQL/PostGIS
```

## Batas tanggung jawab frontend

- `map-core-shared.js`: setup map, base layer, renderer, dan fondasi umum.
- `map-read-shared.js`: loading data, popup detail, legend, dan optimasi read.
- `map-admin-edit-shared.js`: CRUD serta interaksi edit admin.
- `admin.js`: orchestration dan logic khusus admin.
- `user.js`: bootstrap dan logic khusus viewer.

Perubahan yang berlaku untuk admin dan user tidak boleh digandakan di `admin.js` dan `user.js`.

## Aturan reuse fungsi

- Fungsi format, validasi, request API, dan transformasi data yang dipakai lebih dari satu modul ditempatkan di utility/shared module.
- Browser global digunakan melalui satu namespace bersama bila kompatibilitas script klasik masih diperlukan.
- Module tidak boleh membuat salinan logic hanya karena dipakai oleh role berbeda.
- Setiap fungsi shared harus memiliki nama, tanggung jawab, dan dependensi yang jelas agar tidak berubah menjadi tempat penampungan logic acak.
