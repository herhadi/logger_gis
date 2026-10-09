# Audit Migrasi Frontend Legacy ke Next.js

Dokumen ini mencatat parity fitur berdasarkan pembacaan kode repository, bukan hasil uji browser. Status "sudah dipindahkan" berarti implementasi terlihat di kode Next.js; perilaku runtime tetap perlu diuji.

## Implementasi yang sudah terlihat di `apps/frontend`

- [x] Halaman Next.js untuk login, user, dan admin.
- [x] Peta MapLibre dengan basemap OSM, citra satelit, Google Hybrid, dan Google Satellite.
- [x] Layer vector marker, pipa, dan polygon.
- [x] Cluster marker dan pembukaan marker individual saat cluster diperbesar.
- [x] Toggle visibilitas layer dan pemilihan basemap.
- [x] Editor create/update/delete untuk marker, pipa, dan polygon.
- [x] Panel editor yang diposisikan dekat geometri terpilih dan ditutup ketika tipe geometri lain dipilih.
- [x] Legenda diameter pipa yang mengirim event filter.
- [x] Highlight pipa berdasarkan diameter yang dipilih, serta reset ketika diameter yang sama dipilih lagi.
- [x] Pencarian lokasi Geoapify, pengurutan hasil, dan navigasi peta ke hasil terpilih.
- [x] Tombol navigasi Google Maps dari editor marker.
- [x] Template environment frontend terpisah dari backend.

## Gap parity yang masih perlu ditangani

### Prioritas tinggi

- [ ] **Statistik area seleksi.** Legacy `frontend/js/admin.js` memiliki `_calculateGeometryInArea(selectionPolygon)` yang mengirim geometri ke `POST /api/selection/stats` dan menampilkan hitungan titik, garis, serta polygon. Alur UI ini belum terlihat di frontend Next.js.
- [ ] **Edit/drag marker dan sinkronisasi endpoint pipa.** Legacy `frontend/js/map-admin-edit-shared.js` memiliki logika marker drag, pencarian pipa yang terhubung, pembaruan koordinat endpoint, dan penyimpanan perubahan terkait. Audit dan implementasikan parity ini sebelum mengandalkan drag marker di admin.
- [ ] **Validasi saat menggambar atau menyimpan pipa.** Legacy menolak pipa baru jika endpoint tidak memenuhi aturan marker. Pastikan aturan yang sama diterapkan di frontend baru dan backend tetap menjadi sumber validasi final.
- [ ] **Pengukuran dan helper geometri.** Audit helper perhitungan luas polygon, normalisasi diameter, snapping, serta validasi geometri legacy; pindahkan hanya perilaku yang masih digunakan.

### Pencarian lokasi

- [x] Input pencarian ringkas di toolbar; klik ikon membuka kolom input dan hasil muncul saat mengetik.
- [ ] Konfigurasikan `NEXT_PUBLIC_GEOAPIFY_API_KEY` di environment deployment frontend.
- [ ] Verifikasi hasil pencarian, klik hasil, dan penanda lokasi di browser.
- [ ] Legacy menggunakan cache hasil pencarian dan menampilkan marker beserta popup lokasi. Implementasi baru saat ini belum memiliki cache hasil dan marker/popup hasil pencarian seperti legacy.

### Pengujian parity yang diperlukan

- [ ] Admin: buat, pilih, ubah, simpan, dan hapus marker.
- [ ] Admin: buat, pilih, ubah, simpan, dan hapus pipa.
- [ ] Admin: buat, pilih, ubah, simpan, dan hapus polygon.
- [ ] Pastikan satu panel editor aktif pada satu waktu.
- [ ] Pastikan klik legenda diameter memfilter pipa yang sesuai dan klik ulang menghapus filter.
- [ ] Pastikan layer toggle, basemap, marker cluster, dan status peta bekerja setelah refresh.
- [ ] Pastikan statistik area seleksi menampilkan hasil yang sama dengan legacy setelah dimigrasikan.
- [ ] Pastikan drag marker tidak merusak geometri pipa yang endpoint-nya terhubung.
- [ ] Jalankan build frontend dan uji alur utama di browser setelah setiap kelompok perubahan.

## Catatan environment

Frontend Next.js membaca:

- `NEXT_PUBLIC_API_URL`: URL base API backend.
- `NEXT_PUBLIC_GEOAPIFY_API_KEY`: key Geoapify untuk pencarian lokasi.

Variabel dengan awalan `NEXT_PUBLIC_` tersedia di browser. Jangan menaruh kredensial database, token Telegram, atau secret session di environment frontend.

## Aturan pembaruan dokumen

Tandai checklist selesai hanya setelah implementasi dan verifikasi yang sesuai dilakukan. Build yang sukses tidak otomatis membuktikan parity UI atau integrasi geometri.
