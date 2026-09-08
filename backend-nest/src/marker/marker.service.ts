import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class MarkerService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async findAll(bbox?: string) {
    let whereClause = '';
    let params: number[] = [];
    if (bbox) {
      const values = bbox.split(',').map(Number);
      if (values.length === 4 && values.every(Number.isFinite)) {
        whereClause = 'WHERE m.geom && ST_MakeEnvelope($1, $2, $3, $4, 4326)';
        params = values;
      }
    }

    const sql = `
      SELECT m.id, ST_AsGeoJSON(m.geom)::json AS geometry, m.tipe
      FROM (
        SELECT ogr_fid AS id, shape AS geom, 'acc' AS tipe FROM gis_acc
        UNION ALL SELECT ogr_fid AS id, shape AS geom, 'reservoir' AS tipe FROM gis_reservoir
        UNION ALL SELECT ogr_fid AS id, shape AS geom, 'tank' AS tipe FROM gis_tank
        UNION ALL SELECT ogr_fid AS id, shape AS geom, 'valve' AS tipe FROM gis_valve
      ) AS m
      ${whereClause}
    `;
    const { rows } = await this.db.query(sql, params);
    return rows.map((row: { geometry: { coordinates: [number, number] } }) => ({
      ...row,
      coords: [row.geometry.coordinates[1], row.geometry.coordinates[0]]
    }));
  }
}
