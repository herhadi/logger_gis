const express = require('express');
const mysql = require('mysql2/promise'); // pakai promise API
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const bcrypt = require('bcrypt');
const cron = require('node-cron');
const fs = require('fs');
const fetch = global.fetch;

const { db, dbSensor, dbGis, dbPostgres } = require('./db'); // koneksi db (mysql2/promise)

const app = express();

app.use(cors());
app.use(express.json());

// session store pakai koneksi db yang sudah ada
const sessionStore = new MySQLStore({}, db);

app.use(session({
  key: 'session_cookie',
  secret: 'rahasia-super-aman',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 1 hari
}));

const offlineCache = new Set(); // menyimpan idmet yang sudah dikirimi notifikasi offline

// === POST Login ===
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    // Pakai dbPostgres dan gunakan format $1 (PostgreSQL)
    const { rows } = await dbPostgres.query('SELECT * FROM users WHERE username = $1', [username]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'User tidak ditemukan' });
    }

    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Password salah' });
    }

    // Update last_login di PostgreSQL
    try {
      await dbPostgres.query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);
    } catch (e) {
      console.warn('Gagal update last_login:', e.message);
    }

    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      last_login: user.last_login
    };

    const redirectUrl = user.role === 'admin' ? '/admin.html' : '/user.html';
    return res.json({ redirect: redirectUrl });

  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// === GET Info Session Aktif ===
app.get('/api/session', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Belum login' });
  }
  // Kirim data user dari session
  res.json({ user: req.session.user });
});

// === POST Logout ===
app.post('/api/logout', (req, res) => {
  req.session.destroy(err => {
    if (err) return res.status(500).json({ error: 'Gagal logout' });
    res.clearCookie('connect.sid');
    res.json({ message: 'Berhasil logout' });
  });
});

// Middleware autentikasi opsional
function requireLogin(req, res, next) {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// === API CRUD untuk PIPA ===

// GET semua pipa
app.get('/api/pipa', async (req, res) => {
  try {
    let sql = `SELECT OGR_FID, AsText(SHAPE) AS coords, dc_id, dia, jenis, panjang, 
                      keterangan, lokasi, status, diameter, roughness, zona
               FROM gis_pipa`;
    const params = [];

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        const [south, west, north, east] = bbox;
        sql += ` WHERE MBRIntersects(
            GeomFromText('POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))'),
            SHAPE
          )`;
      }
    }

    const [results] = await dbGis.query(sql, params);

    const parsed = results.map(row => ({
      id: row.OGR_FID,
      dc_id: row.dc_id,
      dia: row.dia,
      jenis: row.jenis,
      panjang: row.panjang,
      keterangan: row.keterangan,
      lokasi: row.lokasi,
      status: row.status,
      diameter: row.diameter,
      roughness: row.roughness,
      zona: row.zona,
      line: parseLineString(row.coords)
    }));

    res.json(parsed);
  } catch (err) {
    console.error('Error get pipa:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE pipa
app.post('/api/pipa/create', async (req, res) => {
  try {
    const { coords, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona } = req.body;

    if (!coords || coords.length < 2) {
      return res.status(400).json({ error: 'Pipa minimal 2 titik koordinat' });
    }

    // Buat WKT LINESTRING
    const wkt = `LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    const [result] = await dbGis.query(
      `INSERT INTO gis_pipa (SHAPE, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona)
       VALUES (GeomFromText(?), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [wkt, dc_id || null, dia || null, jenis || null, panjang || null, keterangan || null,
        lokasi || null, status || null, diameter || null, roughness || null, zona || null]
    );

    res.json({
      ogr_fid: result.insertId,
      success: true,
      message: "Pipa berhasil disimpan"
    });

  } catch (err) {
    console.error("Error create pipa:", err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE pipa
app.put('/api/pipa/update/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { coords, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona } = req.body;

    if (!coords || coords.length < 2) {
      return res.status(400).json({ error: 'Pipa minimal 2 titik koordinat' });
    }

    const wkt = `LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    const sql = `UPDATE gis_pipa 
                 SET SHAPE = GeomFromText(?), dc_id=?, dia=?, jenis=?, panjang=?, keterangan=?, 
                     lokasi=?, status=?, diameter=?, roughness=?, zona=? 
                 WHERE OGR_FID=?`;

    await dbGis.query(sql, [
      wkt, dc_id || null, dia || null, jenis || null, panjang || null,
      keterangan || null, lokasi || null, status || null, diameter || null,
      roughness || null, zona || null, id
    ]);

    res.json({ success: true, id, message: "Pipa berhasil diperbarui" });
  } catch (err) {
    console.error("Error update pipa:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE pipa
app.delete('/api/pipa/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await dbGis.query("DELETE FROM gis_pipa WHERE OGR_FID = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Pipa tidak ditemukan" });
    }

    res.json({ message: "Pipa berhasil dihapus" });
  } catch (err) {
    console.error("Error delete pipa:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// endpoint daftar diameter unik
app.get('/api/pipa/diameter', async (req, res) => {
  try {
    const [rows] = await dbGis.query(
      // 'SELECT DISTINCT CAST(dia AS UNSIGNED) AS dia FROM gis_pipa ORDER BY CAST(dia AS UNSIGNED) desc;'
      'select distinct diameter from gis_pipa where diameter is not null order by diameter desc;'
    );
    // ambil kolom diameter dari setiap row
    res.json(rows.map(r => r.diameter));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});


// Endpoint baru gabungan diameter + jenis
app.get('/api/pipa/option', async (req, res) => {
  try {
    // Ambil diameter unik
    const [rowsDia] = await dbGis.query(`
      SELECT DISTINCT diameter 
      FROM gis_pipa 
      WHERE diameter IS NOT NULL 
      ORDER BY CAST(diameter AS UNSIGNED) DESC
    `);

    // Ambil jenis unik
    const [rowsJenis] = await dbGis.query(`
      SELECT DISTINCT jenis 
      FROM gis_pipa 
      WHERE jenis IS NOT NULL 
      ORDER BY jenis ASC
    `);

    // Kembalikan dengan struktur mirip sebelumnya
    res.json({
      diameter: rowsDia.map(r => r.diameter),
      jenis: rowsJenis.map(r => r.jenis)
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'DB error' });
  }
});

// Helper parse LINESTRING
function parseLineString(wkt) {
  if (!wkt || !wkt.startsWith('LINESTRING')) return [];
  try {
    const coordsString = wkt.match(/\(([^)]+)\)/);
    if (!coordsString) return [];
    const points = coordsString[1].split(',');
    return points.map(point => {
      const [lng, lat] = point.trim().split(' ').map(Number);
      return [lat, lng]; // Leaflet pakai [lat, lng]
    });
  } catch (err) {
    console.error('Error parsing LineString WKT:', err, wkt);
    return [];
  }
}

// === API CRUD untuk POLYGON ===

// GET semua Polygon
app.get('/api/polygon', async (req, res) => {
  try {
    let sql = 'SELECT OGR_FID, AsText(SHAPE) AS coords, nosamw, luas, lsval, nosambckup FROM gis_srpolygon';
    const params = [];

    // Cek apakah ada bbox di query
    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number); // [south, west, north, east]
      if (bbox.length === 4) {
        const [south, west, north, east] = bbox;
        sql += ` WHERE MBRContains(
            GeomFromText('POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))'),
            SHAPE
          )`;

      }
    }

    const [results] = await dbGis.query(sql, params);

    const parsed = results.map(row => ({
      id: row.OGR_FID,
      nosamw: row.nosamw,
      luas: row.luas,
      lsval: row.lsval,
      nosambckup: row.nosambckup,
      polygon: parsePolygon(row.coords) // tetap pakai helper parsePolygon yang sudah ada
    }));

    res.json(parsed);

  } catch (err) {
    console.error('Error get polygon:', err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE polygon
app.post('/api/polygon/create', async (req, res) => {
  try {
    const { coords, nosamw, nosambckup } = req.body;

    console.log('🔹 Polygon Create - coords:', JSON.stringify(coords));
    console.log('🔹 Polygon Create - nosamw:', nosamw, 'nosambckup:', nosambckup);

    // Validasi dasar
    if (!coords || coords.length < 3)
      return res.status(400).json({ error: 'Polygon minimal 3 titik' });
    if (!nosamw || nosamw.trim() === '')
      return res.status(400).json({ error: 'No Sambung wajib diisi' });

    // Cek duplikasi nosamw
    const [existing] = await dbGis.query(
      'SELECT ogr_fid FROM gis_srpolygon WHERE nosamw = ? LIMIT 1',
      [nosamw]
    );
    if (existing.length > 0) {
      return res.status(400).json({ error: `No Sambung "${nosamw}" sudah ada!` });
    }

    // Pastikan polygon tertutup
    const closedCoords = [...coords];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (Math.abs(first[0] - last[0]) > 0.000001 || Math.abs(first[1] - last[1]) > 0.000001) {
      closedCoords.push(first);
    }

    // Hitung luas
    const lsval = calculateAreaFromCoords(closedCoords);
    const luas = `${lsval} m²`;

    // Generate WKT
    const wkt = `POLYGON((${closedCoords.map(p => `${p[1]} ${p[0]}`).join(',')}))`;

    // Insert ke database
    const [result] = await dbGis.query(
      'INSERT INTO gis_srpolygon (SHAPE, nosamw, luas, lsval, nosambckup) VALUES (GeomFromText(?), ?, ?, ?, ?)',
      [wkt, nosamw, luas, lsval, nosambckup || null]
    );

    // Kirim response sukses
    res.json({
      ogr_fid: result.insertId,
      success: true,
      message: 'Polygon berhasil disimpan',
      lsval,
      luas
    });

  } catch (err) {
    console.error('Error create polygon:', err);
    res.status(500).json({ error: err.message });
  }
});

// UPDATE polygon
app.put('/api/polygon/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { coords, nosamw, nosambckup } = req.body;

    if (!coords || coords.length < 3)
      return res.status(400).json({ error: 'Polygon minimal 3 titik' });

    // pastikan tertutup
    const closedCoords = [...coords];
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      closedCoords.push(first);
    }

    const lsval = calculateAreaFromCoords(closedCoords);
    const luas = `${lsval} m²`;

    const wkt = `POLYGON((${closedCoords.map(p => `${p[1]} ${p[0]}`).join(',')}))`;

    const sql = `UPDATE gis_srpolygon 
                     SET SHAPE = GeomFromText(?), nosamw=?, luas=?, lsval=?, nosambckup=? 
                     WHERE ogr_fid=?`;

    await dbGis.query(sql, [wkt, nosamw, luas, lsval, nosambckup || null, id]);

    res.json({
      success: true,
      id,
      message: "Polygon berhasil diperbarui",
      lsval,
      luas
    });
  } catch (err) {
    console.error('Error update polygon:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE polygon
app.delete('/api/polygon/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    console.log("Delete request for id:", id);

    const [result] = await dbGis.query(
      "DELETE FROM gis_srpolygon WHERE OGR_FID = ?",
      [id]
    );

    console.log("Delete result:", result);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Polygon not found" });
    }

    res.json({ message: "Polygon deleted successfully" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// === API CRUD untuk MARKER ===

// GET semua marker
// === API Marker gabungan dari 4 tabel ===
app.get('/api/marker', async (req, res) => {
  try {
    let bboxFilter = "";
    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        const [west, south, east, north] = bbox;
        bboxFilter = `WHERE MBRContains(
          GeomFromText('POLYGON((${west} ${south}, ${east} ${south}, ${east} ${north}, ${west} ${north}, ${west} ${south}))'),
          SHAPE
        )`;
      }
    }

    const sql = `
      SELECT OGR_FID, AsText(SHAPE) AS coords, tipe, keterangan, lokasi, elevation
      FROM (
        SELECT OGR_FID, SHAPE, 'acc' AS tipe, keterangan, lokasi, elevation 
        FROM gis_acc
        UNION ALL
        SELECT OGR_FID, SHAPE, 'reservoir' AS tipe, NULL AS keterangan, NULL AS lokasi, elevation 
        FROM gis_reservoir
        UNION ALL
        SELECT OGR_FID, SHAPE, 'tank' AS tipe, NULL AS keterangan, NULL AS lokasi, elevation 
        FROM gis_tank
        UNION ALL
        SELECT OGR_FID, SHAPE, 'valve' AS tipe, keterangan, lokasi, elevation 
        FROM gis_valve
      ) AS markers
      ${bboxFilter};
    `;

    const [results] = await dbGis.query(sql);

    const parsed = results.map(row => {
      const coords = parsePoint(row.coords);
      return {
        id: row.OGR_FID,
        tipe: row.tipe,
        keterangan: row.keterangan,
        lokasi: row.lokasi,
        elevation: row.elevation,
        coords
      };
    });

    res.json(parsed);
  } catch (err) {
    console.error("Error get marker:", err);
    res.status(500).json({ error: err.message });
  }
});

// CREATE marker
app.post('/api/marker/create', async (req, res) => {
  try {
    const { coords, nama, tipe, keterangan, status } = req.body;

    if (!coords || coords.length !== 2) {
      return res.status(400).json({ error: 'Koordinat marker wajib diisi' });
    }

    const [lat, lng] = coords;
    const wkt = `POINT(${lng} ${lat})`;

    // tentukan tabel sesuai tipe
    let table;
    switch (tipe) {
      case "acc":        table = "gis_acc"; break;
      case "reservoir":  table = "gis_reservoir"; break;
      case "tank":       table = "gis_tank"; break;
      case "valve":      table = "gis_valve"; break;
      default:
        return res.status(400).json({ error: `Tipe marker tidak valid: ${tipe}` });
    }

    const [result] = await dbGis.query(
      `INSERT INTO ${table} (SHAPE, nama, tipe, keterangan, status) 
       VALUES (GeomFromText(?), ?, ?, ?, ?)`,
      [wkt, nama || null, tipe || null, keterangan || null, status || null]
    );

    res.json({
      ogr_fid: result.insertId,
      success: true,
      message: `Marker ${tipe} berhasil disimpan`
    });
  } catch (err) {
    console.error("Error create marker:", err);
    res.status(500).json({ error: err.message });
  }
});


// UPDATE marker
app.put('/api/marker/update/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { lat, lng, nama, tipe, keterangan, status } = req.body;

    if (!lat || !lng) {
      return res.status(400).json({ error: 'Koordinat marker wajib diisi' });
    }

    const wkt = `POINT(${lng} ${lat})`;

    const sql = `UPDATE gis_marker 
                 SET SHAPE = GeomFromText(?), nama=?, tipe=?, keterangan=?, status=? 
                 WHERE OGR_FID=?`;

    await dbGis.query(sql, [wkt, nama || null, tipe || null, keterangan || null, status || null, id]);

    res.json({ success: true, id, message: "Marker berhasil diperbarui" });
  } catch (err) {
    console.error("Error update marker:", err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE marker
app.delete('/api/marker/delete/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [result] = await dbGis.query("DELETE FROM gis_marker WHERE OGR_FID = ?", [id]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Marker tidak ditemukan" });
    }

    res.json({ message: "Marker berhasil dihapus" });
  } catch (err) {
    console.error("Error delete marker:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Helper parse POINT WKT
function parsePoint(wkt) {
  if (!wkt || !wkt.startsWith('POINT')) return null;
  try {
    const coordsString = wkt.match(/\(([^)]+)\)/);
    if (!coordsString) return null;
    const [lng, lat] = coordsString[1].split(' ').map(Number);
    return [lat, lng]; // Leaflet pakai [lat, lng]
  } catch (err) {
    console.error('Error parsing Point WKT:', err, wkt);
    return null;
  }
}


// Helper untuk hitung luas geodesic polygon (m²)
function calculateAreaFromCoords(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6371000; // radius bumi meter
  let area = 0;
  for (let i = 0; i < coords.length; i++) {
    const [lat1, lng1] = coords[i];
    const [lat2, lng2] = coords[(i + 1) % coords.length];
    area += (lng2 - lng1) * (2 + Math.sin(lat1 * Math.PI / 180) + Math.sin(lat2 * Math.PI / 180));
  }
  area = Math.abs(area) * R * R / 2;
  return Math.round(area);
}

// Helper function untuk parse WKT polygon ke array koordinat
function parsePolygon(wkt) {
  if (!wkt || !wkt.startsWith('POLYGON')) {
    return [];
  }

  try {
    // Extract koordinat dari POLYGON((lng lat, lng lat, ...))
    const coordsString = wkt.match(/\(\(([^)]+)\)\)/);
    if (!coordsString) return [];

    const points = coordsString[1].split(',');
    return points.map(point => {
      const [lng, lat] = point.trim().split(' ').map(Number);
      return [lat, lng]; // Kembalikan sebagai [lat, lng] untuk Leaflet
    });
  } catch (err) {
    console.error('Error parsing polygon WKT:', err, wkt);
    return [];
  }
}

// Telegram Bot Setup
const token = '8340205720:AAFX6H7cRDyItXB45k6fxDpzWOe0XJFtHjc';
// const chat_id = '648351920';  // Ganti dengan chat_id milik Anda
const ADMIN_ID = '648351920';

async function kirimNotifikasiTelegram(chatId, pesan) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: pesan,
        parse_mode: 'Markdown'   // cetak *bold*
      })
    });
    const data = await res.json();
    if (!data.ok) {
      console.error(`❌ Gagal kirim ke ${chatId}:`, data.description);
    } else {
      console.log(`✅ Notifikasi terkirim ke ${chatId}`);
    }
  } catch (err) {
    console.error(`❌ Error kirim ke ${chatId}:`, err);
  }
}

// Telegram webhook handler
app.post('/webhook', async (req, res) => {
  const update = req.body;
  if (!update.message) return res.sendStatus(200);

  const chat_id = update.message.chat.id.toString();
  const username = update.message.chat.username || '';
  const text = update.message.text || '';

  console.log("📩 Pesan masuk:", { chat_id, username, text, ADMIN_ID });

  try {
    const [rows] = await db.query("SELECT * FROM notifikasi_telegram WHERE chat_id = ?", [chat_id]);

    if (chat_id === ADMIN_ID) {
      console.log("✅ Command dari admin:", text);
      if (text === '/listusers') {
        console.log("📋 Menjalankan perintah /listusers");
        const [users] = await db.query("SELECT chat_id, username, aktif, created_at FROM notifikasi_telegram ORDER BY created_at DESC");
        if (users.length === 0) {
          await kirimNotifikasiTelegram(ADMIN_ID, "📋 Tidak ada user terdaftar.");
        } else {
          let daftar = "📋 Daftar User:\n";
          users.forEach(u => {
            daftar += `🆔 ${u.chat_id} | 👤 ${u.username || '-'} | ${u.aktif ? '✅ Aktif' : '❌ Nonaktif'} | 📅 ${u.created_at.toISOString().split('T')[0]}\n`;
          });
          await kirimNotifikasiTelegram(ADMIN_ID, daftar);
        }
      } else if (text.startsWith('/ban_')) {
        const targetId = text.split('_')[1];
        await db.query("UPDATE notifikasi_telegram SET aktif = 0 WHERE chat_id = ?", [targetId]);
        await kirimNotifikasiTelegram(ADMIN_ID, `🚫 User ${targetId} telah dinonaktifkan.`);
        await kirimNotifikasiTelegram(targetId, "🚫 Akses Anda ke bot telah dicabut.");
      } else if (text.startsWith('/approve_')) {
        const targetId = text.split('_')[1];
        await db.query("UPDATE notifikasi_telegram SET aktif = 1 WHERE chat_id = ?", [targetId]);
        await kirimNotifikasiTelegram(ADMIN_ID, `✅ User ${targetId} telah diaktifkan.`);
        await kirimNotifikasiTelegram(targetId, "✅ Akses Anda ke bot telah diaktifkan.");
      } else if (text.startsWith('/broadcast ')) {
        console.log("📢 Menjalankan perintah broadcast");
        const pesan = text.replace('/broadcast ', '').trim();
        const [users] = await db.query("SELECT chat_id FROM notifikasi_telegram WHERE aktif = 1");
        for (const u of users) {
          await kirimNotifikasiTelegram(u.chat_id, pesan);
        }
        await kirimNotifikasiTelegram(ADMIN_ID, `📢 Broadcast terkirim ke ${users.length} user aktif.`);
      }
      return res.sendStatus(200);
    } else {
      console.log("❌ Bukan admin:", chat_id);
    }

    if (rows.length === 0) {
      await db.query("INSERT INTO notifikasi_telegram (chat_id, username, aktif) VALUES (?, ?, 0)", [chat_id, username]);
      await kirimNotifikasiTelegram(chat_id, "⏳ Permintaan Anda menunggu persetujuan admin.");
      await kirimNotifikasiTelegram(ADMIN_ID, `🔔 User baru:\n🆔 ${chat_id} | 👤 ${username}\n\nGunakan /approve_${chat_id} atau /ban_${chat_id}`);
      return res.sendStatus(200);
    }

    if (rows[0].aktif === 0) {
      await kirimNotifikasiTelegram(chat_id, "🚫 Akses Anda belum disetujui admin.");
      return res.sendStatus(200);
    }

    // Tambahkan command lain di sini jika perlu
    if (rows[0].aktif === 0) {
      await kirimNotifikasiTelegram(chat_id, "🚫 Akses Anda belum disetujui admin.");
      return res.sendStatus(200);
    }

    // ===================== Command umum =====================
    if (text === '/start') {
      const pesan =
        `Selamat datang *${username || 'pengguna'}* 👋\n\n` +
        "Bot ini digunakan untuk memantau kondisi logger.\n\n" +
        "📌 Perintah tersedia:\n" +
        "/check - Cek status logger saat ini\n\n" +
        "Notifikasi otomatis akan dikirim jika ada logger offline / online kembali.";

      await kirimNotifikasiTelegram(chat_id, pesan);
      return res.sendStatus(200);

    } else if (text === '/check') {
      const status = await getStatusLoggerSekarang();
      await kirimNotifikasiTelegram(chat_id, status);
      return res.sendStatus(200);

    } else if (text === '/info') {
      const pesan = "ℹ️ Bot Notifikasi Logger\n\n" +
        "- Digunakan untuk memantau kondisi logger\n" +
        "- Anda akan menerima notifikasi otomatis jika ada perubahan\n";
      await kirimNotifikasiTelegram(chat_id, pesan);
      return res.sendStatus(200);

    } else if (text === '/help') {
      const pesan = "❓ Bantuan Perintah:\n\n" +
        "/start - Mulai interaksi dengan bot\n" +
        "/check - Cek status logger saat ini\n" +
        "/info  - Informasi singkat tentang bot\n" +
        "/help  - Menampilkan daftar perintah\n";
      await kirimNotifikasiTelegram(chat_id, pesan);
      return res.sendStatus(200);
    }
    // =========================================================

    // Default jika bukan command yang dikenali
    await kirimNotifikasiTelegram(chat_id, "✅ Perintah tidak tersedia.");

    res.sendStatus(200);

  } catch (e) {
    console.error("Webhook error:", e);
    res.sendStatus(500);
  }
});

function formatWaktu(iso) {
  return new Date(iso).toLocaleString('id-ID', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).replace(/\./g, ':');
}

async function cekLoggerOffline() {
  try {
    const [lokasiList] = await db.query('SELECT idmet, nama FROM lokasi WHERE skip_monitor = 0');
    const [dataSensor] = await dbSensor.query(`
      SELECT idmet, MAX(jam) AS jam_terakhir
      FROM metinlogger_fuji_new
      GROUP BY idmet
    `);

    const now = new Date();
    const offlineToNotify = [];
    const backOnlineToNotify = [];

    lokasiList.forEach(lokasi => {
      const data = dataSensor.find(s => s.idmet === lokasi.idmet);
      const jamTerakhir = data ? new Date(data.jam_terakhir) : null;
      const selisihJam = jamTerakhir ? (now - jamTerakhir) / (1000 * 60 * 60) : Infinity;

      const isOffline = isNaN(jamTerakhir?.getTime()) || selisihJam > 1;

      if (isOffline) {
        if (!offlineCache.has(lokasi.idmet)) {
          offlineCache.add(lokasi.idmet);
          const lastDataTime = jamTerakhir ? formatWaktu(jamTerakhir) : '-';
          offlineToNotify.push(
            `${offlineToNotify.length + 1}. ${lokasi.nama} (${lokasi.idmet})\n   Data terakhir: ${lastDataTime}`
          );
        }
      } else {
        if (offlineCache.has(lokasi.idmet)) {
          const lastDataTime = jamTerakhir ? formatWaktu(jamTerakhir) : '-';
          backOnlineToNotify.push(
            `${backOnlineToNotify.length + 1}. ${lokasi.nama} (${lokasi.idmet})\n   Data terakhir: ${lastDataTime}`
          );
          offlineCache.delete(lokasi.idmet);
        }
      }
    });

    // Ambil semua user aktif
    const [users] = await db.query("SELECT chat_id FROM notifikasi_telegram WHERE aktif = 1");

    if (offlineToNotify.length > 0) {
      const pesan = `⚠️ Logger baru terdeteksi offline >1 jam:\n\n${offlineToNotify.join('\n\n')}`;
      for (const u of users) {
        await kirimNotifikasiTelegram(u.chat_id, pesan);
      }
    }

    if (backOnlineToNotify.length > 0) {
      const pesan = `✅ Logger berikut sudah kembali online:\n\n${backOnlineToNotify.join('\n\n')}`;
      for (const u of users) {
        await kirimNotifikasiTelegram(u.chat_id, pesan);
      }
    }

    if (offlineToNotify.length === 0 && backOnlineToNotify.length === 0) {
      console.log("ℹ️ Tidak ada perubahan status logger.");
    }

  } catch (err) {
    console.error("❌ Error saat cek logger offline:", err.message);
  }
}

async function getStatusLoggerSekarang() {
  const [lokasiList] = await db.query('SELECT idmet, nama FROM lokasi WHERE skip_monitor = 0');
  const [dataSensor] = await dbSensor.query(`
    SELECT idmet, MAX(jam) AS jam_terakhir
    FROM metinlogger_fuji_new
    GROUP BY idmet
  `);

  const now = new Date();
  // let online = [];
  let onlineCount = 0;
  let offline = [];

  lokasiList.forEach((lokasi, idx) => {
    const data = dataSensor.find(s => s.idmet === lokasi.idmet);
    const jamTerakhir = data ? new Date(data.jam_terakhir) : null;
    const selisihJam = jamTerakhir ? (now - jamTerakhir) / (1000 * 60 * 60) : Infinity;

    const isOffline = isNaN(jamTerakhir?.getTime()) || selisihJam > 1;
    const lastDataTime = jamTerakhir ? formatWaktu(jamTerakhir) : '-';

    const baris =
      `${lokasi.nama} (${lokasi.idmet})\n` +
      `   Data terakhir: ${lastDataTime}`;

    if (isOffline) {
      offline.push(`🔴 ${offline.length + 1}. ${baris}`);
    } else {
      // online.push(`🟢 ${online.length + 1}. ${baris}`);
      onlineCount++;
    }
  });

  let pesan = `📊 *Status Logger Saat Ini*\n`;
  pesan += `⏱ ${formatWaktu(now)}\n\n`;

  // if (offline.length > 0) {
  //   pesan += `⚠️ *OFFLINE (>1 jam)*\n\n${offline.join('\n\n')}\n\n`;
  // } else {
  //   pesan += `✅ Semua logger ONLINE\n\n`;
  // }

  // if (online.length > 0) {
  //   pesan += `🟢 *ONLINE*\n\n${online.join('\n\n')}`;
  // }

  if (offline.length > 0) {
    pesan += `⚠️ *OFFLINE (>1 jam)*\n\n`;
    pesan += offline.join('\n\n');
    pesan += `\n\n`;
  } else {
    pesan += `✅ Tidak ada logger offline\n\n`;
  }

  pesan += `🟢 *ONLINE*: ${onlineCount} logger`;

  return pesan;
}

cron.schedule('*/10 * * * *', () => {
  console.log('🕒 Menjalankan pengecekan logger offline setiap 10 menit...'); // */10 * * * *
  cekLoggerOffline();
});

cron.schedule('45 6 * * *', () => { //
  console.log("🔁 Reset offlineCache harian pada jam 06:45 WIB");
  console.log("Logger offline yang akan di-reset:", [...offlineCache]);
  offlineCache.clear();
}, {
  timezone: "Asia/Jakarta"
});


// app.use(express.static(path.join(__dirname, '../frontend'), { index: false })); // untuk mengabaikan file index.html

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

