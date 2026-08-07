const express = require('express');
const { isValidPolygonCoordinates, coordinatesToPolygonWkt } = require('../utils/geometry');

function createPolygonRouter(db, requireLogin) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    try {
      const zoom = Number(req.query.zoom);
      const tolerance = Number.isFinite(zoom) && zoom < 15 ? 0.00015
        : Number.isFinite(zoom) && zoom < 17 ? 0.00005 : 0;
      let sql = `SELECT ogr_fid AS id, ST_AsGeoJSON(ST_FlipCoordinates(CASE WHEN $1::float > 0 THEN ST_SimplifyPreserveTopology(shape, $1::float) ELSE shape END))::json->'coordinates' AS geometry FROM gis_srpolygon`;
      const params = [tolerance];
      if (req.query.bbox) {
        const bbox = req.query.bbox.split(',').map(Number);
        if (bbox.length === 4 && bbox.every(Number.isFinite)) {
          const [south, west, north, east] = bbox;
          sql += ' WHERE shape && ST_MakeEnvelope($2, $3, $4, $5, 4326)';
          params.push(west, south, east, north);
        }
      }
      const { rows } = await db.query(sql, params);
      return res.json(rows);
    } catch (err) {
      console.error('Error get polygon:', err);
      return res.status(500).json({ error: 'Gagal mengambil data polygon' });
    }
  });

  router.get('/:id', requireLogin, async (req, res) => {
    try {
      const { rows } = await db.query(`SELECT ogr_fid AS id, nosamw, luas AS luas_input, lsval, nosambckup, ROUND(ST_Area(shape::geography)) AS luas_hitung FROM gis_srpolygon WHERE ogr_fid = $1`, [req.params.id]);
      if (rows.length === 0) return res.status(404).json({ error: 'Polygon tidak ditemukan' });
      return res.json(rows[0]);
    } catch (err) {
      console.error('Polygon Detail Error:', err.message);
      return res.status(500).json({ error: 'Gagal memuat detail polygon' });
    }
  });

  router.post('/create', requireLogin, async (req, res) => {
    try {
      const { coords, nosamw, nosambckup } = req.body;
      if (!isValidPolygonCoordinates(coords)) return res.status(400).json({ error: 'Polygon minimal membutuhkan 3 titik' });
      const wkt = coordinatesToPolygonWkt(coords);
      const { rows } = await db.query(`INSERT INTO gis_srpolygon (shape, nosamw, nosambckup, lsval, luas) VALUES (ST_MakeValid(ST_GeomFromText($1, 4326)), $2, $3, ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), CONCAT(ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), ' m²')) RETURNING ogr_fid, lsval AS luas_baru`, [wkt, nosamw, nosambckup || null]);
      return res.json({ ogr_fid: rows[0].ogr_fid, success: true, message: 'Polygon berhasil disimpan', luas_m2: rows[0].luas_baru });
    } catch (err) {
      console.error('Error create polygon:', err.message);
      return res.status(500).json({ error: 'Database error saat menyimpan polygon', detail: err.message });
    }
  });

  router.put('/update/:id', requireLogin, async (req, res) => {
    try {
      const { coords, nosamw, nosambckup } = req.body;
      if (!isValidPolygonCoordinates(coords)) return res.status(400).json({ error: 'Koordinat tidak valid' });
      const result = await db.query(`UPDATE gis_srpolygon SET shape = ST_GeomFromText($1, 4326), nosamw = $2, nosambckup = $3, lsval = ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), luas = CONCAT(ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), ' m²') WHERE ogr_fid = $4`, [coordinatesToPolygonWkt(coords), nosamw, nosambckup || null, req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'Data tidak ditemukan' });
      return res.json({ success: true, message: 'Polygon berhasil diperbarui' });
    } catch (err) {
      console.error('Error update polygon:', err);
      return res.status(500).json({ error: err.message });
    }
  });

  router.delete('/delete/:id', requireLogin, async (req, res) => {
    try {
      const result = await db.query('DELETE FROM gis_srpolygon WHERE ogr_fid = $1', [req.params.id]);
      if (result.rowCount === 0) return res.status(404).json({ message: 'Polygon tidak ditemukan' });
      return res.json({ message: 'Polygon berhasil dihapus' });
    } catch (err) {
      console.error(err);
      return res.status(500).json({ message: 'Gagal menghapus polygon' });
    }
  });

  return router;
}

function createSelectionRouter(db) {
  const router = express.Router();
  router.post('/stats', async (req, res) => {
    try {
      const { geometry, includePoints = true, includeLines = true, includePolygons = true } = req.body || {};
      if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) {
        return res.status(400).json({ error: 'Geometry polygon tidak valid' });
      }
      const sql = `
        WITH selection AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom),
        point_count AS (SELECT COUNT(*)::int AS total FROM (
          SELECT shape FROM gis_acc UNION ALL SELECT shape FROM gis_reservoir
          UNION ALL SELECT shape FROM gis_tank UNION ALL SELECT shape FROM gis_valve
        ) pts CROSS JOIN selection s WHERE $2::boolean = TRUE AND pts.shape IS NOT NULL AND ST_Intersects(pts.shape, s.geom)),
        line_count AS (SELECT COUNT(*)::int AS total FROM gis_pipa p CROSS JOIN selection s WHERE $3::boolean = TRUE AND p.shape IS NOT NULL AND ST_Intersects(p.shape, s.geom)),
        polygon_count AS (SELECT COUNT(*)::int AS total FROM gis_srpolygon poly CROSS JOIN selection s WHERE $4::boolean = TRUE AND poly.shape IS NOT NULL AND ST_Intersects(poly.shape, s.geom))
        SELECT (SELECT total FROM point_count) AS point_count, (SELECT total FROM line_count) AS line_count, (SELECT total FROM polygon_count) AS polygon_count
      `;
      const { rows } = await db.query(sql, [JSON.stringify(geometry), includePoints, includeLines, includePolygons]);
      const row = rows[0] || {};
      return res.json({ pointCount: row.point_count || 0, lineCount: row.line_count || 0, polygonCount: row.polygon_count || 0 });
    } catch (err) {
      console.error('Selection Stats Error:', err.message);
      return res.status(500).json({ error: 'Gagal menghitung statistik area' });
    }
  });
  return router;
}

module.exports = { createPolygonRouter, createSelectionRouter };
