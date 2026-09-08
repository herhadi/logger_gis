import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

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

  async selectionStats(body: any) {
    const { geometry, includePoints = true, includeLines = true, includePolygons = true } = body || {};
    if (!geometry || geometry.type !== 'Polygon' || !Array.isArray(geometry.coordinates)) return { error: 'Geometry polygon tidak valid' };
    const sql = `WITH selection AS (SELECT ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON($1), 4326)) AS geom), point_count AS (SELECT COUNT(*)::int AS total FROM (SELECT shape FROM gis_acc UNION ALL SELECT shape FROM gis_reservoir UNION ALL SELECT shape FROM gis_tank UNION ALL SELECT shape FROM gis_valve) pts CROSS JOIN selection s WHERE $2::boolean = TRUE AND pts.shape IS NOT NULL AND ST_Intersects(pts.shape, s.geom)), line_count AS (SELECT COUNT(*)::int AS total FROM gis_pipa p CROSS JOIN selection s WHERE $3::boolean = TRUE AND p.shape IS NOT NULL AND ST_Intersects(p.shape, s.geom)), polygon_count AS (SELECT COUNT(*)::int AS total FROM gis_srpolygon poly CROSS JOIN selection s WHERE $4::boolean = TRUE AND poly.shape IS NOT NULL AND ST_Intersects(poly.shape, s.geom)) SELECT (SELECT total FROM point_count) AS point_count, (SELECT total FROM line_count) AS line_count, (SELECT total FROM polygon_count) AS polygon_count`;
    const { rows } = await this.db.query(sql, [JSON.stringify(geometry), includePoints, includeLines, includePolygons]);
    const row = rows[0] || {};
    return { pointCount: row.point_count || 0, lineCount: row.line_count || 0, polygonCount: row.polygon_count || 0 };
  }
}
