require('dotenv').config();
const mysql = require('mysql2/promise');
const { Pool } = require('pg');

console.log("Cek URL DB:", process.env.DATABASE_URL ? "Ditemukan" : "Tidak Ditemukan");

// Koneksi ke database lokasi
const db = mysql.createPool({
  host: 'localhost',
  user: 'root',
  password: 'pdambTg!23', // ganti sesuai config
  database: 'mqtt',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Koneksi ke database sensor
const dbSensor = mysql.createPool({
  host: '192.168.10.212',
  user: 'root',
  password: 'b1ll1ngs3ndangk4mulyan#@!', // ganti sesuai config
  database: 'simpb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const dbGis = mysql.createPool({
  host: '192.168.10.212',
  user: 'root',
  password: 'b1ll1ngs3ndangk4mulyan#@!', // ganti sesuai config
  database: 'gis',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Koneksi PostgreSQL/PostGIS (Baru - Railway)
const dbPostgres = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

module.exports = { db, dbSensor, dbGis, dbPostgres };
