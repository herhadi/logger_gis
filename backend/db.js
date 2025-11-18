const mysql = require('mysql2/promise');

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

module.exports = { db, dbSensor, dbGis };
