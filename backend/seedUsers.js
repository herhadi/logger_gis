// Jalankan di Node.js shell atau seeder setup
const bcrypt = require('bcrypt');
const mysql = require('mysql2');

const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'pdambTg!23',
  database: 'mqtt'
});

const username = 'petugas';
const password = '12345';
const role = 'user';

bcrypt.hash(password, 10, (err, hash) => {
  if (err) throw err;

  const sql = 'INSERT INTO users (username, password, role) VALUES (?, ?, ?)';
  db.query(sql, [username, hash, role], (err) => {
    if (err) throw err;
    console.log('User biasa berhasil ditambahkan.');
    db.end();
  });
});
