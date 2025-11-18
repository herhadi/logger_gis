// jalankan sekali di Node.js terminal
// seedAdmin.js

const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

(async () => {
  try {
    const db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'pdambTg!23',
      database: 'mqtt'
    });

    const username = 'admin';
    const password = 'admin123';
    const hashed = await bcrypt.hash(password, 10);

    const [existing] = await db.execute('SELECT * FROM users WHERE username = ?', [username]);
    if (existing.length > 0) {
      console.log('❗ User admin sudah ada.');
    } else {
      await db.execute(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
        [username, hashed, 'admin']
      );
      console.log('✅ User admin berhasil dibuat.');
    }

    db.end();
  } catch (err) {
    console.error('❌ Gagal membuat user admin:', err);
  }
})();

