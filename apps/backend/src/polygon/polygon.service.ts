import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { getTile, setTile } from '../database/tile-cache';

@Injectable()
export class PolygonService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async findAll(bbox?: string, zoom?: string) {
    const level = Number(zoom);
    const tolerance = Number.isFinite(level) && level < 15 ? 0.00015 : Number.isFinite(level) && level < 17 ? 0.00005 : 0;
    let sql = `SELECT ogr_fid AS id, ST_AsGeoJSON(ST_FlipCoordinates(CASE WHEN $1::float > 0 THEN ST_SimplifyPreserveTopology(shape, $1::float) ELSE shape END))::json->'coordinates' AS geometry FROM gis_srpolygon`;
    const params: number[] = [tolerance];
    if (bbox) {
      const values = bbox.split(',').map(Number);
      if (values.length === 4 && values.every(Number.isFinite)) {
        const [south, west, north, east] = values;
        sql += ' WHERE shape && ST_MakeEnvelope($2, $3, $4, $5, 4326)';
        params.push(west, south, east, north);
      }
    }
    const { rows } = await this.db.query(sql, params);
    return rows;
  }

  async tile(zValue: string, xValue: string, yValue: string) {
    const z = Number(zValue); const x = Number(xValue); const y = Number(yValue);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) throw new HttpException({ error: 'Parameter tile tidak valid' }, HttpStatus.BAD_REQUEST);
    const cacheKey = `polygon:${z}:${x}:${y}`;
    const cached = getTile(cacheKey);
    if (cached) return cached;
    const query = `WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS tile) SELECT COALESCE(ST_AsMVT(tile_data, 'polygon', 4096, 'geom'), ''::bytea) AS tile FROM (SELECT ogr_fid AS id, nosamw, ST_AsMVTGeom(ST_Transform(shape, 3857), bounds.tile, 4096, 64, TRUE) AS geom FROM gis_srpolygon CROSS JOIN bounds WHERE shape && ST_Transform(bounds.tile, 4326) AND ST_Intersects(shape, ST_Transform(bounds.tile, 4326))) AS tile_data WHERE geom IS NOT NULL`;
    const { rows } = await this.db.query(query, [z, x, y]);
    const tile = rows[0]?.tile || Buffer.alloc(0);
    setTile(cacheKey, tile);
    return tile;
  }

  async selectionStats(body: any) {
    const { geometry, includePoints = true, includeLines = true, includePolygons = true } = body || {};
    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return { error: 'Geometry polygon tidak valid' };
    const sql = `WITH selection AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom), point_count AS (SELECT COUNT(*)::int AS total FROM (SELECT shape FROM gis_acc UNION ALL SELECT shape FROM gis_reservoir UNION ALL SELECT shape FROM gis_tank UNION ALL SELECT shape FROM gis_valve) pts CROSS JOIN selection s WHERE $2::boolean = TRUE AND pts.shape IS NOT NULL AND ST_Intersects(pts.shape, s.geom)), line_count AS (SELECT COUNT(*)::int AS total FROM gis_pipa p CROSS JOIN selection s WHERE $3::boolean = TRUE AND p.shape IS NOT NULL AND ST_Intersects(p.shape, s.geom)), polygon_count AS (SELECT COUNT(*)::int AS total FROM gis_srpolygon poly CROSS JOIN selection s WHERE $4::boolean = TRUE AND poly.shape IS NOT NULL AND ST_Intersects(poly.shape, s.geom)) SELECT (SELECT total FROM point_count) AS point_count, (SELECT total FROM line_count) AS line_count, (SELECT total FROM polygon_count) AS polygon_count`;
    const { rows } = await this.db.query(sql, [JSON.stringify(geometry), includePoints, includeLines, includePolygons]);
    const row = rows[0] || {};
    return { pointCount: row.point_count || 0, lineCount: row.line_count || 0, polygonCount: row.polygon_count || 0 };
  }

  private polygonWkt(coords: any) {
    if (!Array.isArray(coords) || coords.length < 3 || coords.some(point => !Array.isArray(point) || point.length < 2 || point.slice(0, 2).some(value => value === null || value === '' || !Number.isFinite(Number(value))))) return null;
    const points = coords.map(([lat, lng]) => `${lng} ${lat}`);
    if (points[points.length - 1] !== points[0]) points.push(points[0]);
    return `POLYGON((${points.join(', ')}))`;
  }

  async findOne(id: string) {
    const { rows } = await this.db.query(`SELECT ogr_fid AS id, nosamw, luas AS luas_input, lsval, nosambckup, ROUND(ST_Area(shape::geography)) AS luas_hitung FROM gis_srpolygon WHERE ogr_fid = $1`, [id]);
    if (!rows.length) throw new HttpException({ error: 'Polygon tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return rows[0];
  }

  async create(body: any) {
    const wkt = this.polygonWkt(body.coords);
    if (!wkt) throw new HttpException({ error: 'Polygon minimal membutuhkan 3 titik' }, HttpStatus.BAD_REQUEST);
    const { rows } = await this.db.query(`INSERT INTO gis_srpolygon (shape, nosamw, nosambckup, lsval, luas) VALUES (ST_MakeValid(ST_GeomFromText($1, 4326)), $2, $3, ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), CONCAT(ROUND(ST_Area(ST_MakeValid(ST_GeomFromText($1, 4326))::geography)), ' m²')) RETURNING ogr_fid, lsval AS luas_baru`, [wkt, body.nosamw, body.nosambckup || null]);
    return { ogr_fid: rows[0].ogr_fid, success: true, message: 'Polygon berhasil disimpan', luas_m2: rows[0].luas_baru };
  }

  async update(id: string, body: any) {
    const wkt = this.polygonWkt(body.coords);
    if (!wkt) throw new HttpException({ error: 'Koordinat tidak valid' }, HttpStatus.BAD_REQUEST);
    const result = await this.db.query(`UPDATE gis_srpolygon SET shape = ST_GeomFromText($1, 4326), nosamw = $2, nosambckup = $3, lsval = ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), luas = CONCAT(ROUND(ST_Area(ST_GeomFromText($1, 4326)::geography)), ' m²') WHERE ogr_fid = $4`, [wkt, body.nosamw, body.nosambckup || null, id]);
    if (!result.rowCount) throw new HttpException({ error: 'Data tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { success: true, message: 'Polygon berhasil diperbarui' };
  }

  async remove(id: string) {
    const result = await this.db.query('DELETE FROM gis_srpolygon WHERE ogr_fid = $1', [id]);
    if (!result.rowCount) throw new HttpException({ message: 'Polygon tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { message: 'Polygon berhasil dihapus' };
  }
}
