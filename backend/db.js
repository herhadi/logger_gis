require('dotenv').config();
const { Pool } = require('pg');

/**
 * Konfigurasi Koneksi PostgreSQL (Railway)
 * Menggunakan Connection Pool untuk efisiensi resource.
 */
const dbPostgres = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    // Wajib untuk koneksi eksternal ke database cloud Railway
    rejectUnauthorized: false 
  },
  max: 20,                  // Maksimal koneksi simultan
  idleTimeoutMillis: 30000, // Tutup koneksi idle setelah 30 detik
  connectionTimeoutMillis: 2000, // Timeout jika gagal konek dalam 2 detik
});

// Event listener untuk memantau error pada pool
dbPostgres.on('error', (err) => {
  console.error('❌ Unexpected error on idle PostgreSQL client:', err.message);
});

// Verifikasi koneksi saat server start (Opsional)
dbPostgres.connect((err, client, release) => {
  if (err) {
    return console.error('❌ Gagal menyambung ke PostgreSQL:', err.stack);
  }
  console.log('✅ Terhubung ke PostgreSQL NeonTech dengan sukses');
  release();
});

module.exports = { dbPostgres };