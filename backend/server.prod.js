const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const cron = require('node-cron');
const fs = require('fs');

// Gunakan node-fetch jika versi Node.js kamu di bawah 18, 
// tapi di Railway (Node 18+) fetch sudah global.
const fetch = global.fetch;

// Kita hanya butuh dbPostgres sekarang
const { dbPostgres } = require('./db');

const app = express();

// PENTING: Trust proxy untuk HTTPS Railway agar cookie 'secure: true' terkirim
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json());

// === KONFIGURASI SESSION POSTGRESQL ===
app.use(session({
  store: new pgSession({
    pool: dbPostgres,
    tableName: 'session',
    createTableIfMissing: false
  }),
  key: 'session_cookie',
  // Gunakan env variable, jika tidak ada baru pakai fallback
  secret: process.env.SESSION_SECRET || 'rahasia-super-aman-sekali',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000,      // 1 hari
    secure: true,                     // Wajib true karena Railway pakai HTTPS
    sameSite: 'none',                 // Penting untuk cross-site jika frontend & backend beda domain
    httpOnly: true                    // Menghindari akses cookie dari Javascript client (lebih aman)
  }
}));

// === POST Login ===
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Gunakan query berparameter untuk mencegah SQL Injection
    const { rows } = await dbPostgres.query('SELECT * FROM users WHERE username = $1', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);

    if (!valid) {
      return res.status(401).json({ error: 'Password salah' });
    }

    // Update last_login secara async (jangan ditunggu agar login lebih cepat)
    dbPostgres.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id])
      .catch(e => console.error('Gagal update last_login:', e.message));

    // Simpan data ke session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role
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
app.post('/api/logout', (req, res) => {
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
app.get('/api/session', (req, res) => {
  if (req.session && req.session.user) {
    res.json({ user: req.session.user });
  } else {
    res.status(401).json({ error: "Unauthorized" });
  }
});

// Middleware autentikasi untuk proteksi API
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  }
  next();
}

// === API CRUD untuk PIPA (PostgreSQL Version) ===
// GET semua pipa
app.get('/api/pipa', async (req, res) => {
  try {
    let sql = `
      SELECT 
        ogr_fid AS id, 
        dc_id, dia, jenis, 
        panjang AS panjang_input,
        ROUND(ST_Length(shape::geography)) AS panjang_hitung, 
        keterangan, lokasi, status, diameter, roughness, zona,
        -- KITA BALIK DI SINI: PostGIS membalik Lng,Lat menjadi Lat,Lng
        -- Lalu kita ambil langsung array 'coordinates'-nya saja
        ST_AsGeoJSON(ST_FlipCoordinates(shape))::json->'coordinates' AS geometry
      FROM gis_pipa
    `;
    const params = [];

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        // Urutan Leaflet bbox biasanya: [South, West, North, East]
        // PostGIS ST_MakeEnvelope: (min_lng, min_lat, max_lng, max_lat, srid)
        const [south, west, north, east] = bbox;
        sql += ` WHERE shape && ST_MakeEnvelope($1, $2, $3, $4, 4326)`;
        params.push(west, south, east, north);
      }
    }

    const { rows } = await dbPostgres.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error('Error get pipa:', err);
    res.status(500).json({ error: 'Gagal mengambil data pipa' });
  }
});

// CREATE pipa
app.post('/api/pipa/create', requireLogin, async (req, res) => {
  try {
    const { coords, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona } = req.body;

    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      return res.status(400).json({ error: 'Data koordinat tidak valid (minimal 2 titik)' });
    }

    // Pastikan koordinat bersih dan urutan benar (Lng Lat)
    const validCoords = coords.filter(p => p && p.length === 2);
    const wkt = `LINESTRING(${validCoords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    const sql = `
      INSERT INTO gis_pipa (shape, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona)
      VALUES (ST_GeomFromText($1, 4326), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING ogr_fid
    `;

    const result = await dbPostgres.query(sql, [
      wkt, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona
    ]);

    res.json({
      ogr_fid: result.rows[0].ogr_fid,
      success: true,
      message: "Pipa berhasil disimpan"
    });
  } catch (err) {
    console.error("Error create pipa:", err);
    res.status(500).json({ error: "Gagal menyimpan pipa ke database" });
  }
});

// UPDATE pipa
app.put('/api/pipa/update/:id', requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    const { coords, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona } = req.body;

    if (!coords || coords.length < 2) {
      return res.status(400).json({ error: 'Data koordinat tidak valid' });
    }

    const wkt = `LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    const sql = `
      UPDATE gis_pipa 
      SET shape = ST_GeomFromText($1, 4326), dc_id=$2, dia=$3, jenis=$4, panjang=$5, 
          keterangan=$6, lokasi=$7, status=$8, diameter=$9, roughness=$10, zona=$11 
      WHERE ogr_fid=$12
    `;

    const result = await dbPostgres.query(sql, [
      wkt, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona, id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pipa tidak ditemukan" });
    }

    res.json({ success: true, message: "Pipa berhasil diperbarui" });
  } catch (err) {
    console.error("Error update pipa:", err);
    res.status(500).json({ error: "Gagal memperbarui data pipa" });
  }
});

// Endpoint Option (Diameter & Jenis)
app.get('/api/pipa/option', async (req, res) => {
  try {
    // Gunakan ORDER BY numeric jika kolom diameter mengandung angka agar sorting rapi (misal: 100, 50, 25)
    const diaQuery = `SELECT DISTINCT diameter FROM gis_pipa WHERE diameter IS NOT NULL ORDER BY diameter DESC`;
    const jenisQuery = `SELECT DISTINCT jenis FROM gis_pipa WHERE jenis IS NOT NULL ORDER BY jenis ASC`;

    const [resDia, resJenis] = await Promise.all([
      dbPostgres.query(diaQuery),
      dbPostgres.query(jenisQuery)
    ]);

    res.json({
      diameter: resDia.rows.map(r => r.diameter),
      jenis: resJenis.rows.map(r => r.jenis)
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat opsi pipa' });
  }
});

// === API CRUD untuk POLYGON (PostgreSQL Version) ===
// GET semua Polygon
app.get('/api/polygon', async (req, res) => {
  try {
    let sql = `
      SELECT 
        ogr_fid AS id, 
        nosamw, 
        luas AS luas_input, 
        lsval, 
        nosambckup,
        -- 1. Balik koordinat (Lng,Lat -> Lat,Lng)
        -- 2. Ambil hanya array 'coordinates' agar payload lebih ramping
        ST_AsGeoJSON(ST_FlipCoordinates(shape))::json->'coordinates' AS geometry,
        ROUND(ST_Area(shape::geography)) AS luas_hitung 
      FROM srpolygon
    `;
    const params = [];

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        // Urutan: South, West, North, East (Standard Leaflet BBOX)
        const [south, west, north, east] = bbox;
        sql += ` WHERE shape && ST_MakeEnvelope($1, $2, $3, $4, 4326)`;
        // Urutan Envelope: min_lng, min_lat, max_lng, max_lat
        params.push(west, south, east, north);
      }
    }

    const { rows } = await dbPostgres.query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Error get polygon:', err);
    res.status(500).json({ error: 'Gagal mengambil data polygon' });
  }
});

// CREATE polygon
app.post('/api/polygon/create', requireLogin, async (req, res) => {
  try {
    const { coords, nosamw, nosambckup } = req.body;

    if (!coords || coords.length < 3) {
      return res.status(400).json({ error: 'Polygon minimal membutuhkan 3 titik' });
    }

    // Pastikan polygon tertutup (titik akhir = titik awal)
    let closedCoords = [...coords];
    const first = closedCoords[0];
    const last = closedCoords[closedCoords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closedCoords.push(first);
    }

    // Format WKT (Lng Lat)
    const wkt = `POLYGON((${closedCoords.map(p => `${p[1]} ${p[0]}`).join(',')}))`;

    // Biarkan DB menghitung luas secara otomatis saat INSERT
    const sql = `
      INSERT INTO srpolygon (shape, nosamw, nosambckup, lsval, luas) 
      VALUES (
        ST_GeomFromText($1, 4326), 
        $2, 
        $3, 
        ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), -- Simpan ke lsval
        CONCAT(ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), ' m²') -- Simpan ke luas
      ) 
      RETURNING ogr_fid, lsval AS luas_baru
    `;

    const { rows } = await dbPostgres.query(sql, [wkt, nosamw, nosambckup || null]);

    res.json({
      ogr_fid: rows[0].ogr_fid,
      success: true,
      message: 'Polygon berhasil disimpan',
      luas_m2: rows[0].luas_baru
    });
  } catch (err) {
    console.error('Error create polygon:', err);
    res.status(500).json({ error: 'Database error saat menyimpan polygon' });
  }
});

// UPDATE polygon
app.put('/api/polygon/update/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { coords, nosamw, nosambckup } = req.body;

    if (!coords || coords.length < 3) return res.status(400).json({ error: 'Koordinat tidak valid' });

    // Penutupan otomatis
    let closed = [...coords];
    if (closed[0][0] !== closed[closed.length - 1][0]) closed.push(closed[0]);

    const wkt = `POLYGON((${closed.map(p => `${p[1]} ${p[0]}`).join(',')}))`;

    const sql = `
      UPDATE srpolygon 
      SET 
        shape = ST_GeomFromText($1, 4326), 
        nosamw = $2, 
        nosambckup = $3,
        lsval = ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)),
        luas = CONCAT(ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), ' m²')
      WHERE ogr_fid = $4
    `;

    const result = await dbPostgres.query(sql, [wkt, nosamw, nosambckup || null, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Data tidak ditemukan" });

    res.json({ success: true, message: "Polygon berhasil diperbarui" });
  } catch (err) {
    console.error('Error update polygon:', err);
    res.status(500).json({ error: err.message });
  }
});

// === API CRUD untuk MARKER ===
// 1. GET semua marker (Optimized with Database Casting)
app.get('/api/marker', async (req, res) => {
  try {
    let params = [];
    let whereClause = "";

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        // PostGIS Envelope: West, South, East, North
        whereClause = `WHERE m.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)`;
        params = [bbox[0], bbox[1], bbox[2], bbox[3]];
      }
    }

    const sql = `
      SELECT 
        m.id, 
        ST_AsGeoJSON(m.geom)::json AS geometry, -- Casting langsung ke JSON di Postgres
        m.tipe, 
        m.keterangan, 
        m.lokasi, 
        m.elevation
      FROM (
        SELECT ogr_fid AS id, shape AS geom, 'acc' AS tipe, keterangan, lokasi, elevation FROM gis_acc
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'reservoir' AS tipe, NULL AS keterangan, NULL AS lokasi, elevation FROM gis_reservoir
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'tank' AS tipe, NULL AS keterangan, NULL AS lokasi, elevation FROM gis_tank
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'valve' AS tipe, keterangan, lokasi, elevation FROM gis_valve
      ) AS m
      ${whereClause}
    `;

    const { rows } = await dbPostgres.query(sql, params);

    // Sekarang mapping jauh lebih ringan karena 'geometry' sudah objek JSON
    const parsed = rows.map(row => ({
      ...row,
      coords: [row.geometry.coordinates[1], row.geometry.coordinates[0]]
    }));

    res.json(parsed);
  } catch (err) {
    console.error("CRITICAL ERROR MARKER:", err.message);
    res.status(500).json({ error: "Gagal memuat marker" });
  }
});

// 2. CREATE marker (With Strict Table Validation)
app.post('/api/marker/create', requireLogin, async (req, res) => {
  try {
    const { coords, dc_id, tipe, keterangan, zona } = req.body;

    // Validasi Input
    if (!coords || coords.length !== 2) return res.status(400).json({ error: 'Koordinat tidak valid' });

    // Whitelist tabel untuk mencegah SQL Injection pada nama tabel
    const whitelist = {
      'acc': 'gis_acc',
      'reservoir': 'gis_reservoir',
      'tank': 'gis_tank',
      'valve': 'gis_valve'
    };

    const tableName = whitelist[tipe];
    if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak terdaftar' });

    const wkt = `POINT(${coords[1]} ${coords[0]})`;

    const sql = `INSERT INTO ${tableName} (shape, dc_id, keterangan, zona) 
                 VALUES (ST_GeomFromText($1, 4326), $2, $3, $4) 
                 RETURNING ogr_fid`;

    const result = await dbPostgres.query(sql, [wkt, dc_id, keterangan, zona]);

    res.json({
      id: result.rows[0].ogr_fid,
      success: true,
      message: `Marker ${tipe} berhasil disimpan`
    });
  } catch (err) {
    console.error("Create Marker Error:", err);
    res.status(500).json({ error: err.message });
  }
});

// 3. UPDATE marker
app.put('/api/marker/update/:tipe/:id', requireLogin, async (req, res) => {
  try {
    const { id, tipe } = req.params;
    const { coords, dc_id, keterangan, zona, lokasi, elevation } = req.body;

    const whitelist = { 'acc': 'gis_acc', 'reservoir': 'gis_reservoir', 'tank': 'gis_tank', 'valve': 'gis_valve' };
    const tableName = whitelist[tipe];

    if (!tableName) return res.status(400).json({ error: 'Tipe tidak valid' });
    if (!coords || coords.length !== 2) return res.status(400).json({ error: 'Koordinat wajib [lat, lng]' });

    const wkt = `POINT(${coords[1]} ${coords[0]})`;

    const sql = `
      UPDATE ${tableName} 
      SET 
        shape = ST_GeomFromText($1, 4326), 
        dc_id = $2, 
        keterangan = $3, 
        zona = $4,
        lokasi = $5,
        elevation = $6,
        tgl_update = CURRENT_TIMESTAMP
      WHERE ogr_fid = $7
    `;

    const result = await dbPostgres.query(sql, [wkt, dc_id, keterangan, zona, lokasi, elevation, id]);

    if (result.rowCount === 0) return res.status(404).json({ error: "Data tidak ditemukan" });

    res.json({ success: true, message: `Marker ${tipe} diperbarui` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Telegram Bot Setup
// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
async function kirimTelegram(chatId, pesan) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: pesan,
        parse_mode: 'Markdown'
      })
    });
    return await res.json();
  } catch (err) {
    console.error(`❌ Error Telegram (${chatId}):`, err.message);
  }
}

function formatWaktu(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta'
  }).format(new Date(date));
}

// ==========================================
// 2. WEBHOOK HANDLER (Bot Logic)
// ==========================================
app.post('/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const username = message.chat.username || message.chat.first_name || 'User';

  try {
    // Gunakan dbPostgres (Pool pusat)
    const { rows } = await dbPostgres.query("SELECT * FROM notif_telegram WHERE chat_id = $1", [chatId]);
    const user = rows[0];

    // --- LOGIKA KHUSUS ADMIN ---
    if (chatId === ADMIN_ID) {
      if (text === '/listusers') {
        const { rows: users } = await dbPostgres.query("SELECT chat_id, username, aktif FROM notif_telegram ORDER BY created_at DESC");
        let daftar = "📋 *Daftar User:*\n\n";
        users.forEach((u, i) => {
          daftar += `${i + 1}. \`${u.chat_id}\` | @${u.username || '-'} | ${u.aktif ? '✅' : '❌'}\n`;
        });
        await kirimTelegram(ADMIN_ID, users.length ? daftar : "📋 Belum ada user.");
        return res.sendStatus(200);
      }

      if (text.startsWith('/approve_')) {
        const target = text.split('_')[1];
        if (!target) return res.sendStatus(200);
        await dbPostgres.query("UPDATE notif_telegram SET aktif = TRUE WHERE chat_id = $1", [target]);
        await kirimTelegram(ADMIN_ID, `✅ User ${target} telah disetujui.`);
        await kirimTelegram(target, "✅ Akses Anda telah aktif. Gunakan /start untuk mulai.");
        return res.sendStatus(200);
      }

      // Broadcast Logic
      if (text.startsWith('/broadcast ')) {
        const pesanKonten = text.replace('/broadcast ', '').trim();
        const { rows: targets } = await dbPostgres.query("SELECT chat_id FROM notif_telegram WHERE aktif = TRUE");
        for (const target of targets) {
          await kirimTelegram(target.chat_id, `📢 *BROADCAST*\n\n${pesanKonten}`);
        }
        await kirimTelegram(ADMIN_ID, `📢 Terkirim ke ${targets.length} user.`);
        return res.sendStatus(200);
      }
    }

    // --- LOGIKA PENDAFTARAN USER ---
    if (!user) {
      await dbPostgres.query("INSERT INTO notif_telegram (chat_id, username, aktif) VALUES ($1, $2, FALSE)", [chatId, username]);
      await kirimTelegram(chatId, "⏳ ID Anda terdaftar. Menunggu persetujuan admin.");
      await kirimTelegram(ADMIN_ID, `🔔 *User Baru Daftar*:\nID: \`${chatId}\`\nUser: @${username}\n\nApprove: /approve_${chatId}`);
      return res.sendStatus(200);
    }

    if (!user.aktif) {
      return kirimTelegram(chatId, "🚫 Akses Anda belum disetujui admin.");
    }

    // --- COMMAND UMUM ---
    switch (text) {
      case '/start':
        await kirimTelegram(chatId, `Halo *${username}*! 👋\nBot pemantau logger aktif.`);
        break;
      case '/check':
        const statusMsg = await getStatusLogger();
        await kirimTelegram(chatId, statusMsg);
        break;
      case '/help':
        await kirimTelegram(chatId, "❓ *Perintah*:\n/check - Status saat ini\n/help - Bantuan");
        break;
      default:
        await kirimTelegram(chatId, "✅ Gunakan /check untuk melihat status logger.");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
});

// ==========================================
// 3. LOGIKA MONITORING (CORE)
// ==========================================
async function getStatusLogger() {
  const query = `
    SELECT l.nama, ll.jam 
    FROM lokasi_logger l
    LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
    WHERE l.skip_monitor = 0
  `;
  const { rows } = await dbPostgres.query(query);
  const now = new Date();
  let offline = [];
  let onlineCount = 0;

  rows.forEach(row => {
    const selisihJam = row.jam ? (now - new Date(row.jam)) / (1000 * 60 * 60) : Infinity;
    if (selisihJam > 1) {
      offline.push(`🔴 ${row.nama} (${formatWaktu(row.jam)})`);
    } else {
      onlineCount++;
    }
  });

  return `📊 *Status Logger*\n⏱ ${formatWaktu(now)}\n\n` +
    (offline.length ? `⚠️ *OFFLINE*:\n${offline.join('\n')}\n\n` : `✅ Semua Online\n`) +
    `🟢 *ONLINE*: ${onlineCount}`;
}

async function cekLoggerDanNotif() {
  try {
    const query = `
      SELECT l.idmet, l.nama, ll.jam,
             CASE WHEN ll.jam < NOW() - INTERVAL '1 hour' OR ll.jam IS NULL THEN 'OFFLINE' ELSE 'ONLINE' END as status_skr,
             ns.status_terakhir as status_lama
      FROM lokasi_logger l
      LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
      LEFT JOIN notif_status ns ON l.idmet = ns.idmet
      WHERE l.skip_monitor = 0
    `;
    const { rows } = await dbPostgres.query(query);
    let alerts = [];

    for (const r of rows) {
      if (r.status_skr !== r.status_lama) {
        // Simpan status baru ke notif_status
        await dbPostgres.query(
          `INSERT INTO notif_status (idmet, status_terakhir, last_change) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (idmet) 
           DO UPDATE SET status_terakhir = EXCLUDED.status_terakhir, last_change = NOW()`,
          [r.idmet, r.status_skr]
        );
        const icon = r.status_skr === 'OFFLINE' ? '🔴' : '🟢';
        alerts.push(`${icon} *${r.status_skr}*: ${r.nama}\nJam: ${formatWaktu(r.jam)}`);
      }
    }

    if (alerts.length > 0) {
      const { rows: users } = await dbPostgres.query("SELECT chat_id FROM notif_telegram WHERE aktif = TRUE");
      const pesan = alerts.join('\n\n');
      for (const u of users) {
        await kirimTelegram(u.chat_id, pesan);
      }
    }
  } catch (err) {
    console.error("Cron Error:", err.message);
  }
}

// ==========================================
// 4. CRON SCHEDULE
// ==========================================
cron.schedule('*/10 * * * *', () => {
  cekLoggerDanNotif();
});

app.use(express.static(path.join(__dirname, '../frontend')));
// === Redirect root ke login.html ===
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// === START SERVER ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
