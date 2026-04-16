const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const cron = require('node-cron');
const fs = require('fs');
const isProduction = process.env.NODE_ENV === 'production';
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const ADMIN_ID = process.env.ADMIN_ID;

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
  secret: process.env.SESSION_SECRET || 'rahasia-super-aman-sekali',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 hari
    // DI LOKAL (HTTP): Wajib false agar cookie tersimpan
    // DI RAILWAY (HTTPS): Wajib true agar aman
    secure: isProduction,
    // DI LOKAL: 'lax' sudah cukup
    // DI RAILWAY: 'none' jika frontend & backend beda domain
    sameSite: isProduction ? 'none' : 'lax',
    httpOnly: true
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
    const zoom = Number(req.query.zoom);
    const simplifyTolerance =
      Number.isFinite(zoom) && zoom < 14 ? 0.0002 :
        Number.isFinite(zoom) && zoom < 16 ? 0.00008 :
          0;

    let sql = `
      SELECT 
        ogr_fid AS id, 
        diameter,
        ST_AsGeoJSON(
          ST_FlipCoordinates(
            CASE
              WHEN $1::float > 0 THEN ST_SimplifyPreserveTopology(shape, $1::float)
              ELSE shape
            END
          )
        )::json->'coordinates' AS geometry
      FROM gis_pipa
    `;
    const params = [simplifyTolerance];

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        // Urutan Leaflet bbox biasanya: [South, West, North, East]
        // PostGIS ST_MakeEnvelope: (min_lng, min_lat, max_lng, max_lat, srid)
        const [south, west, north, east] = bbox;
        sql += ` WHERE shape && ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
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
    const {
      coords, dc_id, dia, jenis, panjang, keterangan,
      lokasi, status, diameter, roughness, zona
    } = req.body;

    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      return res.status(400).json({ error: 'Data koordinat tidak valid (minimal 2 titik)' });
    }

    // --- 1. MEMBERSIHKAN DATA NUMERIC ---
    // Fungsi ini membuang 'mm', 'm', atau spasi agar Postgres tidak error 22P02
    const cleanNumber = (val) => {
      if (val === undefined || val === null || val === "") return null;
      // Hanya ambil angka, titik desimal, dan tanda minus
      const num = parseFloat(val.toString().replace(/[^\d.-]/g, ''));
      return isNaN(num) ? null : num;
    };

    // --- 2. FORMAT GEOMETRI (WKT) ---
    const validCoords = coords.filter(p => p && p.length === 2);
    const wkt = `LINESTRING(${validCoords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    // --- 3. QUERY SQL ---
    const sql = `
      INSERT INTO gis_pipa (
        shape, dc_id, dia, jenis, panjang, 
        keterangan, lokasi, status, diameter, roughness, zona
      )
      VALUES (
        ST_GeomFromText($1, 4326), $2, $3, $4, $5, 
        $6, $7, $8, $9, $10, $11
      )
      RETURNING ogr_fid
    `;

    // Pastikan semua kolom numerik dilewatkan ke cleanNumber()
    const values = [
      wkt,
      dc_id || null,
      cleanNumber(dia),
      jenis || null,
      cleanNumber(panjang),
      keterangan || null,
      lokasi || null,
      status || null,
      cleanNumber(diameter),  // Solusi untuk error "300 mm"
      cleanNumber(roughness),
      zona || null
    ];

    const result = await dbPostgres.query(sql, values);

    res.json({
      ogr_fid: result.rows[0].ogr_fid,
      success: true,
      message: "Pipa berhasil disimpan"
    });

  } catch (err) {
    // Debugging lebih detail di log server
    console.error("Error create pipa detail:", err.message);

    res.status(500).json({
      error: "Gagal menyimpan pipa ke database",
      detail: err.message // Membantu debug langsung di tab Network browser
    });
  }
});

// UPDATE pipa
app.put('/api/pipa/update/:id', requireLogin, async (req, res) => {
  try {
    const id = req.params.id;
    const { coords, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona } = req.body;

    if (!coords || !Array.isArray(coords) || coords.length < 2) {
      return res.status(400).json({ error: 'Data koordinat tidak valid' });
    }

    // Samakan dengan endpoint CREATE agar input seperti "300 mm" tidak bikin Postgres error 22P02.
    const cleanNumber = (val) => {
      if (val === undefined || val === null || val === "") return null;
      const num = parseFloat(val.toString().replace(/[^\d.-]/g, ''));
      return isNaN(num) ? null : num;
    };

    const validCoords = coords.filter(p => p && p.length === 2);
    const wkt = `LINESTRING(${validCoords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;

    const sql = `
      UPDATE gis_pipa 
      SET shape = ST_GeomFromText($1, 4326), dc_id=$2, dia=$3, jenis=$4, panjang=$5, 
          keterangan=$6, lokasi=$7, status=$8, diameter=$9, roughness=$10, zona=$11 
      WHERE ogr_fid=$12
    `;

    const result = await dbPostgres.query(sql, [
      wkt,
      dc_id || null,
      cleanNumber(dia),
      jenis || null,
      cleanNumber(panjang),
      keterangan || null,
      lokasi || null,
      status || null,
      cleanNumber(diameter),
      cleanNumber(roughness),
      zona || null,
      id
    ]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Pipa tidak ditemukan" });
    }

    res.json({ success: true, message: "Pipa berhasil diperbarui" });
  } catch (err) {
    console.error("Error update pipa:", err);
    res.status(500).json({ error: "Gagal memperbarui data pipa", detail: err.message });
  }
});

app.delete('/api/pipa/delete/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await dbPostgres.query('DELETE FROM gis_pipa WHERE ogr_fid = $1', [id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Pipa tidak ditemukan' });
    }

    res.json({ success: true, message: 'Pipa berhasil dihapus' });
  } catch (err) {
    console.error('Error delete pipa:', err.message);
    res.status(500).json({ error: 'Gagal menghapus pipa' });
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

app.get('/api/pipa/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await dbPostgres.query(`
      SELECT
        ogr_fid AS id,
        dc_id, dia, jenis,
        panjang AS panjang_input,
        ROUND(ST_Length(shape::geography)) AS panjang_hitung,
        keterangan, lokasi, status, diameter, roughness, zona
      FROM gis_pipa
      WHERE ogr_fid = $1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Pipa tidak ditemukan' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Pipa Detail Error:', err.message);
    res.status(500).json({ error: 'Gagal memuat detail pipa' });
  }
});

// === API CRUD untuk POLYGON (PostgreSQL Version) ===
// GET semua Polygon
app.get('/api/polygon', async (req, res) => {
  try {
    const zoom = Number(req.query.zoom);
    const simplifyTolerance =
      Number.isFinite(zoom) && zoom < 15 ? 0.00015 :
        Number.isFinite(zoom) && zoom < 17 ? 0.00005 :
          0;

    let sql = `
      SELECT 
        ogr_fid AS id, 
        ST_AsGeoJSON(
          ST_FlipCoordinates(
            CASE
              WHEN $1::float > 0 THEN ST_SimplifyPreserveTopology(shape, $1::float)
              ELSE shape
            END
          )
        )::json->'coordinates' AS geometry
      FROM gis_srpolygon
    `;
    const params = [simplifyTolerance];

    if (req.query.bbox) {
      const bbox = req.query.bbox.split(',').map(Number);
      if (bbox.length === 4) {
        // Urutan: South, West, North, East (Standard Leaflet BBOX)
        const [south, west, north, east] = bbox;
        sql += ` WHERE shape && ST_MakeEnvelope($2, $3, $4, $5, 4326)`;
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

app.get('/api/polygon/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await dbPostgres.query(`
      SELECT
        ogr_fid AS id,
        nosamw,
        luas AS luas_input,
        lsval,
        nosambckup,
        ROUND(ST_Area(shape::geography)) AS luas_hitung
      FROM gis_srpolygon
      WHERE ogr_fid = $1
    `, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Polygon tidak ditemukan' });

    res.json(rows[0]);
  } catch (err) {
    console.error('Polygon Detail Error:', err.message);
    res.status(500).json({ error: 'Gagal memuat detail polygon' });
  }
});

app.post('/api/selection/stats', async (req, res) => {
  try {
    const { geometry, includePoints = true, includeLines = true, includePolygons = true } = req.body || {};

    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
      return res.status(400).json({ error: 'Geometry polygon tidak valid' });
    }

    const geometryJson = JSON.stringify(geometry);
    const sql = `
      WITH selection AS (
        SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom
      ),
      point_count AS (
        SELECT COUNT(*)::int AS total
        FROM (
          SELECT shape FROM gis_acc
          UNION ALL
          SELECT shape FROM gis_reservoir
          UNION ALL
          SELECT shape FROM gis_tank
          UNION ALL
          SELECT shape FROM gis_valve
        ) pts
        CROSS JOIN selection s
        WHERE $2::boolean = TRUE
          AND pts.shape IS NOT NULL
          AND ST_Intersects(pts.shape, s.geom)
      ),
      line_count AS (
        SELECT COUNT(*)::int AS total
        FROM gis_pipa p
        CROSS JOIN selection s
        WHERE $3::boolean = TRUE
          AND p.shape IS NOT NULL
          AND ST_Intersects(p.shape, s.geom)
      ),
      polygon_count AS (
        SELECT COUNT(*)::int AS total
        FROM gis_srpolygon poly
        CROSS JOIN selection s
        WHERE $4::boolean = TRUE
          AND poly.shape IS NOT NULL
          AND ST_Intersects(poly.shape, s.geom)
      )
      SELECT
        (SELECT total FROM point_count) AS point_count,
        (SELECT total FROM line_count) AS line_count,
        (SELECT total FROM polygon_count) AS polygon_count
    `;

    const { rows } = await dbPostgres.query(sql, [geometryJson, includePoints, includeLines, includePolygons]);
    const row = rows[0] || {};

    res.json({
      pointCount: row.point_count || 0,
      lineCount: row.line_count || 0,
      polygonCount: row.polygon_count || 0
    });
  } catch (err) {
    console.error('Selection Stats Error:', err.message);
    res.status(500).json({ error: 'Gagal menghitung statistik area' });
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
    // Tambahkan ST_MakeValid agar poligon "melintir" tetap bisa disimpan & dihitung luasnya
    const sql = `
      INSERT INTO gis_srpolygon (shape, nosamw, nosambckup, lsval, luas) 
      VALUES (
        ST_MakeValid(ST_GeomFromText($1, 4326)), 
        $2, 
        $3, 
        ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), 
        CONCAT(ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), ' m²')
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
    console.error('Error create polygon:', err.message); // Cetak pesan spesifik
    res.status(500).json({
      error: 'Database error saat menyimpan polygon',
      detail: err.message // Kirim detail error ke browser
    });
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
      UPDATE gis_srpolygon 
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

// DELETE polygon
app.delete('/api/polygon/delete/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;

    // Gunakan dbPostgres agar konsisten dengan endpoint lainnya
    const result = await dbPostgres.query(
      "DELETE FROM gis_srpolygon WHERE ogr_fid = $1",
      [id]
    );

    // Di Postgres (pg node), gunakan result.rowCount
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Polygon tidak ditemukan" });
    }

    res.json({ message: "Polygon berhasil dihapus" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Gagal menghapus polygon" });
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
        m.tipe
      FROM (
        SELECT ogr_fid AS id, shape AS geom, 'acc' AS tipe FROM gis_acc
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'reservoir' AS tipe FROM gis_reservoir
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'tank' AS tipe FROM gis_tank
        UNION ALL
        SELECT ogr_fid AS id, shape AS geom, 'valve' AS tipe FROM gis_valve
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

app.get('/api/marker/:tipe/:id', requireLogin, async (req, res) => {
  try {
    const { id, tipe } = req.params;
    const whitelist = {
      'acc': 'gis_acc',
      'reservoir': 'gis_reservoir',
      'tank': 'gis_tank',
      'valve': 'gis_valve'
    };

    const tableName = whitelist[tipe];
    if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak valid' });

    // Detect available columns so detail query stays compatible across table variants
    const { rows: cols } = await dbPostgres.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name IN ('ogr_fid', 'dc_id', 'keterangan', 'zona', 'lokasi', 'elevation')`,
      [tableName]
    );

    const availableColumns = new Set(cols.map(c => c.column_name));
    const selectColumns = [];

    if (availableColumns.has('ogr_fid')) selectColumns.push('ogr_fid AS id');
    if (availableColumns.has('dc_id')) selectColumns.push('dc_id');
    if (availableColumns.has('keterangan')) selectColumns.push('keterangan');
    if (availableColumns.has('zona')) selectColumns.push('zona');
    if (availableColumns.has('lokasi')) selectColumns.push('lokasi');
    if (availableColumns.has('elevation')) selectColumns.push('elevation');

    if (selectColumns.length === 0) {
      return res.status(500).json({ error: 'Tabel marker tidak memiliki kolom metadata yang valid' });
    }

    const sql = `SELECT ${selectColumns.join(', ')} FROM ${tableName} WHERE ogr_fid = $1`;
    const { rows } = await dbPostgres.query(sql, [id]);

    if (rows.length === 0) return res.status(404).json({ error: 'Marker tidak ditemukan' });

    res.json({ ...rows[0], tipe });
  } catch (err) {
    console.error('Marker Detail Error:', err);
    res.status(500).json({ error: 'Gagal memuat detail marker' });
  }
});

// 2. CREATE marker (With Strict Table Validation)
app.post('/api/marker/create', requireLogin, async (req, res) => {
  try {
    const { coords, dc_id, tipe, keterangan, zona, lokasi, elevation } = req.body;

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

    // Build dynamic SQL dengan hanya kolom yang ada value
    const columns = ['shape', 'dc_id'];
    const params = [wkt, dc_id];
    let paramCount = 2;

    if (keterangan !== null && keterangan !== undefined) {
      columns.push('keterangan');
      params.push(keterangan);
      paramCount++;
    }
    if (zona !== null && zona !== undefined) {
      columns.push('zona');
      params.push(zona);
      paramCount++;
    }
    if (lokasi !== null && lokasi !== undefined) {
      columns.push('lokasi');
      params.push(lokasi);
      paramCount++;
    }
    if (elevation !== null && elevation !== undefined) {
      columns.push('elevation');
      params.push(elevation);
      paramCount++;
    }

    // Create placeholders: $1 for shape (special ST_GeomFromText), $2+ for other columns
    const placeholders = columns.map((col, idx) => {
      if (idx === 0) return `ST_GeomFromText($1, 4326)`; // shape column needs ST_GeomFromText
      return `$${idx + 1}`;
    }).join(', ');

    const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) 
                 VALUES (${placeholders}) 
                 RETURNING ogr_fid`;

    const result = await dbPostgres.query(sql, params);

    res.json({
      id: result.rows[0].ogr_fid,
      ogr_fid: result.rows[0].ogr_fid,
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

// 4. DELETE marker
app.delete('/api/marker/delete/:tipe/:id', requireLogin, async (req, res) => {
  try {
    const { id, tipe } = req.params;

    const whitelist = {
      'acc': 'gis_acc',
      'reservoir': 'gis_reservoir',
      'tank': 'gis_tank',
      'valve': 'gis_valve'
    };

    const tableName = whitelist[tipe];
    if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak valid' });

    const result = await dbPostgres.query(`DELETE FROM ${tableName} WHERE ogr_fid = $1`, [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Marker tidak ditemukan' });

    res.json({ success: true, message: `Marker ${tipe} berhasil dihapus` });
  } catch (err) {
    console.error('Delete Marker Error:', err.message);
    res.status(500).json({ error: 'Gagal menghapus marker' });
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
    SELECT l.idmet, l.nama, ll.jam 
    FROM logger_lokasi l
    LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
    WHERE l.skip_monitor = FALSE
  `;

  const { rows } = await dbPostgres.query(query);

  const now = new Date();
  let offline = [];
  let onlineCount = 0;

  rows.forEach((row, index) => {
    const selisihJam = row.jam
      ? (now - new Date(row.jam)) / (1000 * 60 * 60)
      : Infinity;

    // const delay = row.jam
    //   ? Math.floor((now - new Date(row.jam)) / (1000 * 60))
    //   : '-';

    if (selisihJam > 1) {
      // offline.push(
      //   `🔴 ${offline.length + 1}. ${row.nama} (${row.idmet})\n` +
      //   `   Data terakhir: ${formatWaktu(row.jam)} (${delay} menit lalu)`
      // );
       offline.push(
        `🔴 ${offline.length + 1}. ${row.nama} (${row.idmet})\n` +
        `   Data terakhir: ${formatWaktu(row.jam)}`
      );
    } else {
      onlineCount++;
    }
  });

  return (
    `📊 *Status Logger Saat Ini*\n` +
    `⏱ ${formatWaktu(now)}\n\n` +
    (offline.length
      ? `⚠️ *OFFLINE (>1 jam)*\n\n${offline.join('\n\n')}\n\n`
      : `✅ Semua Online\n\n`) +
    `🟢 *ONLINE*: ${onlineCount} logger`
  );
}

async function cekLoggerDanNotif() {
  try {
    const query = `
      SELECT l.idmet, l.nama, ll.jam,
             CASE WHEN ll.jam < NOW() - INTERVAL '1 hour' OR ll.jam IS NULL THEN 'OFFLINE' ELSE 'ONLINE' END as status_skr,
             ns.status_terakhir as status_lama
      FROM logger_lokasi l
      LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
      LEFT JOIN notif_status ns ON l.idmet = ns.idmet
      WHERE l.skip_monitor = FALSE
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
// cron.schedule('*/10 * * * *', () => {
//   cekLoggerDanNotif();
// }); // Dialihkan ke endpoint /api/cron dan hit menggunakan UptimeRobot

// === API TESTING TELEGRAM ===
app.get('/api/test-telegram', async (req, res) => {
  await kirimTelegram(process.env.ADMIN_ID, "✅ Test notif dari server Render berhasil!");
  res.send("OK");
});

app.get('/api/test-monitor', async (req, res) => {
  await cekLoggerDanNotif();
  res.send("Monitor executed");
});

app.get('/api/set-webhook', async (req, res) => {
  try {
    const webhookUrl = `${process.env.BASE_URL}/webhook`;

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      }
    );

    const data = await response.json();

    console.log("📡 Set webhook:", data);

    res.json({
      success: true,
      webhook: webhookUrl,
      telegram: data
    });

  } catch (err) {
    console.error("❌ Set webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/webhook-info', async (req, res) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getWebhookInfo`
    );

    const data = await response.json();

    console.log("🔍 Webhook info:", data);

    res.json(data);

  } catch (err) {
    console.error("❌ Get webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/delete-webhook', async (req, res) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/deleteWebhook`
    );

    const data = await response.json();

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let lastRun = 0;

// Endpoint untuk trigger cron manual (juga bisa untuk keep-alive)
// dengan rate limit 10 menit sekali di UptimeRobot
app.get('/api/cron', async (req, res) => {
  console.log("🚀 Cron jalan:", new Date());

  res.send("OK"); // response cepat

  try {
    await cekLoggerDanNotif();
  } catch (err) {
    console.error("❌ Cron error:", err.message);

    await kirimTelegram(process.env.ADMIN_ID,
      `🚨 CRON ERROR\n${err.message}`
    );
  }
});

// === STATIC FILES (PRODUCTION) ===
app.use(express.static(path.join(__dirname, '../frontend')));
// === Redirect root ke login.html ===
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

// === START SERVER ===
const PORT = process.env.PORT || 4000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
