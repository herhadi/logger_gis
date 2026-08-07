const express = require('express');
const bcrypt = require('bcrypt');

function createAuthRouter(db) {
  const router = express.Router();

// === POST Login ===
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Gunakan query berparameter untuk mencegah SQL Injection
    const { rows } = await db.query('SELECT * FROM users WHERE username = $1', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Password salah' });
    }

    // Update last_login dan simpan nilai timestamp terbaru ke session.
    let lastLogin = user.last_login || null;
    try {
      const { rows: loginRows } = await db.query(
        'UPDATE users SET last_login = NOW() WHERE id = $1 RETURNING last_login',
        [user.id]
      );
      lastLogin = loginRows[0]?.last_login || lastLogin;
    } catch (e) {
      console.error('Gagal update last_login:', e.message);
    }

    // Simpan data ke session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      last_login: lastLogin
    };

    // Paksa simpan ke database sebelum memberi respon ke client
    req.session.save((err) => {
      if (err) {
        console.error('Session Save Error:', err);
        return res.status(500).json({ error: 'Gagal menyimpan sesi' });
      }
      const redirectUrl = user.role === 'admin' ? '/admin.html' : '/user.html';
      return res.json({ redirect: redirectUrl });
    });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// === POST Logout ===
router.post('/logout', (req, res) => {
  if (req.session) {
    req.session.destroy(err => {
      if (err) {
        return res.status(500).json({ error: 'Gagal logout' });
      }
      res.clearCookie('session_cookie', { path: '/' }); // Bersihkan cookie secara eksplisit
      return res.json({ message: 'Berhasil logout' });
    });
  } else {
    res.end();
  }
});

// === GET Session (untuk cek apakah user sudah login) ===
router.get('/session', async (req, res) => {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { rows } = await db.query(
      'SELECT last_login FROM users WHERE id = $1',
      [req.session.user.id]
    );

    const lastLogin = rows[0]?.last_login || null;
    req.session.user.last_login = lastLogin;

    return res.json({
      user: {
        ...req.session.user,
        last_login: lastLogin
      }
    });
  } catch (err) {
    console.error('Gagal ambil session user detail:', err.message);
    return res.json({ user: req.session.user });
  }
});


  return router;
}

module.exports = { createAuthRouter };

