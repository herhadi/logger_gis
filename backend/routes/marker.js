const express = require('express');
const {
  markerUnionSql,
  getMarkerTable,
  isValidCoordinates,
  coordinatesToWkt
} = require('../utils/marker');

function createMarkerRouter(db, requireLogin) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      let params = [];
      let whereClause = '';

      if (req.query.bbox) {
        const bbox = req.query.bbox.split(',').map(Number);
        if (bbox.length === 4 && bbox.every(Number.isFinite)) {
          whereClause = 'WHERE m.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)';
          params = bbox;
        }
      }

      const sql = `
        SELECT m.id, ST_AsGeoJSON(m.geom)::json AS geometry, m.tipe
        FROM (${markerUnionSql()}) AS m
        ${whereClause}
      `;
      const { rows } = await db.query(sql, params);
      const parsed = rows.map(row => ({
        ...row,
        coords: [row.geometry.coordinates[1], row.geometry.coordinates[0]]
      }));

      return res.json(parsed);
    } catch (err) {
      console.error('CRITICAL ERROR MARKER:', err.message);
      return res.status(500).json({ error: 'Gagal memuat marker' });
    }
  });

  router.get('/:tipe/:id', requireLogin, async (req, res) => {
    try {
      const { id, tipe } = req.params;
      const tableName = getMarkerTable(tipe);
      if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak valid' });

      const { rows: cols } = await db.query(
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
      const { rows } = await db.query(sql, [id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Marker tidak ditemukan' });
      return res.json({ ...rows[0], tipe });
    } catch (err) {
      console.error('Marker Detail Error:', err);
      return res.status(500).json({ error: 'Gagal memuat detail marker' });
    }
  });

  router.post('/create', requireLogin, async (req, res) => {
    try {
      const { coords, dc_id, tipe, keterangan, zona, lokasi, elevation } = req.body;
      if (!isValidCoordinates(coords)) {
        return res.status(400).json({ error: 'Koordinat tidak valid' });
      }

      const tableName = getMarkerTable(tipe);
      if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak terdaftar' });

      const columns = ['shape', 'dc_id'];
      const params = [coordinatesToWkt(coords), dc_id];
      for (const [column, value] of Object.entries({ keterangan, zona, lokasi, elevation })) {
        if (value !== null && value !== undefined) {
          columns.push(column);
          params.push(value);
        }
      }

      const placeholders = columns.map((column, index) => (
        index === 0 ? 'ST_GeomFromText($1, 4326)' : `$${index + 1}`
      )).join(', ');
      const sql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING ogr_fid`;
      const result = await db.query(sql, params);

      return res.json({
        id: result.rows[0].ogr_fid,
        ogr_fid: result.rows[0].ogr_fid,
        success: true,
        message: `Marker ${tipe} berhasil disimpan`
      });
    } catch (err) {
      console.error('Create Marker Error:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.put('/update/:tipe/:id', requireLogin, async (req, res) => {
    try {
      const { id, tipe } = req.params;
      const { coords, dc_id, keterangan, zona, lokasi, elevation } = req.body;
      const tableName = getMarkerTable(tipe);
      if (!tableName) return res.status(400).json({ error: 'Tipe tidak valid' });
      if (!isValidCoordinates(coords)) {
        return res.status(400).json({ error: 'Koordinat wajib [lat, lng]' });
      }

      const sql = `
        UPDATE ${tableName}
        SET shape = ST_GeomFromText($1, 4326), dc_id = $2, keterangan = $3,
            zona = $4, lokasi = $5, elevation = $6, tgl_update = CURRENT_TIMESTAMP
        WHERE ogr_fid = $7
      `;
      const result = await db.query(sql, [
        coordinatesToWkt(coords), dc_id, keterangan, zona, lokasi, elevation, id
      ]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
      return res.json({ success: true, message: `Marker ${tipe} diperbarui` });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/delete/:tipe/:id', requireLogin, async (req, res) => {
    try {
      const { id, tipe } = req.params;
      const tableName = getMarkerTable(tipe);
      if (!tableName) return res.status(400).json({ error: 'Tipe marker tidak valid' });
      const result = await db.query(`DELETE FROM ${tableName} WHERE ogr_fid = $1`, [id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Marker tidak ditemukan' });
      return res.json({ success: true, message: `Marker ${tipe} berhasil dihapus` });
    } catch (err) {
      console.error('Delete Marker Error:', err.message);
      return res.status(500).json({ error: 'Gagal menghapus marker' });
    }
  });

  return router;
}

module.exports = { createMarkerRouter };
