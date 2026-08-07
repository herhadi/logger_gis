const express = require('express');

function createPipaRouter(db, requireLogin) {
  const router = express.Router();

// === API CRUD untuk PIPA (PostgreSQL Version) ===
// GET semua pipa
router.get('/', async (req, res) => {
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

    const { rows } = await db.query(sql, params);
    res.json(rows);

  } catch (err) {
    console.error('Error get pipa:', err);
    res.status(500).json({ error: 'Gagal mengambil data pipa' });
  }
});

// CREATE pipa
router.post('/create', requireLogin, async (req, res) => {
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

    const result = await db.query(sql, values);

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
router.put('/update/:id', requireLogin, async (req, res) => {
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

    const result = await db.query(sql, [
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

router.delete('/delete/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM gis_pipa WHERE ogr_fid = $1', [id]);

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
router.get('/option', async (req, res) => {
  try {
    // Gunakan ORDER BY numeric jika kolom diameter mengandung angka agar sorting rapi (misal: 100, 50, 25)
    const diaQuery = `SELECT DISTINCT diameter FROM gis_pipa WHERE diameter IS NOT NULL ORDER BY diameter DESC`;
    const jenisQuery = `SELECT DISTINCT jenis FROM gis_pipa WHERE jenis IS NOT NULL ORDER BY jenis ASC`;

    const [resDia, resJenis] = await Promise.all([
      db.query(diaQuery),
      db.query(jenisQuery)
    ]);

    res.json({
      diameter: resDia.rows.map(r => r.diameter),
      jenis: resJenis.rows.map(r => r.jenis)
    });
  } catch (err) {
    res.status(500).json({ error: 'Gagal memuat opsi pipa' });
  }
});

router.get('/:id', requireLogin, async (req, res) => {
  try {
    const { id } = req.params;
    const { rows } = await db.query(`
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


  return router;
}

module.exports = { createPipaRouter };
