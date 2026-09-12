import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';
import { getTile, setTile } from '../database/tile-cache';

const markerTables: Record<string, string> = {
  acc: 'gis_acc', reservoir: 'gis_reservoir', tank: 'gis_tank', valve: 'gis_valve'
};

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

  async tile(zValue: string, xValue: string, yValue: string) {
    const z = Number(zValue); const x = Number(xValue); const y = Number(yValue);
    if (!Number.isInteger(z) || !Number.isInteger(x) || !Number.isInteger(y) || z < 0 || z > 22 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z) {
      throw new HttpException({ error: 'Parameter tile tidak valid' }, HttpStatus.BAD_REQUEST);
    }
    const cacheKey = `marker:${z}:${x}:${y}`;
    const cached = getTile(cacheKey);
    if (cached) return cached;
    const query = `WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS tile), markers AS (SELECT ogr_fid AS id, shape AS geom, 'acc' AS tipe FROM gis_acc UNION ALL SELECT ogr_fid AS id, shape AS geom, 'reservoir' AS tipe FROM gis_reservoir UNION ALL SELECT ogr_fid AS id, shape AS geom, 'tank' AS tipe FROM gis_tank UNION ALL SELECT ogr_fid AS id, shape AS geom, 'valve' AS tipe FROM gis_valve) SELECT COALESCE(ST_AsMVT(tile_data, 'markers', 4096, 'geom'), ''::bytea) AS tile FROM (SELECT id, tipe, ST_AsMVTGeom(ST_Transform(markers.geom, 3857), bounds.tile, 4096, 64, TRUE) AS geom FROM markers CROSS JOIN bounds WHERE markers.geom && ST_Transform(bounds.tile, 4326) AND ST_Intersects(markers.geom, ST_Transform(bounds.tile, 4326))) AS tile_data WHERE geom IS NOT NULL`;
    const { rows } = await this.db.query(query, [z, x, y]);
    const tile = rows[0]?.tile || Buffer.alloc(0);
    setTile(cacheKey, tile);
    return tile;
  }

  private table(type: string) {
    return markerTables[type];
  }

  private coordinates(body: Record<string, unknown>) {
    const coords = body.coords;
    if (!Array.isArray(coords) || coords.length !== 2 || coords.some(value => value === null || value === '' || !Number.isFinite(Number(value)))) {
      return null;
    }
    return `POINT(${coords[1]} ${coords[0]})`;
  }

  async findOne(type: string, id: string) {
    const table = this.table(type);
    if (!table) throw new HttpException({ error: 'Tipe marker tidak valid' }, HttpStatus.BAD_REQUEST);
    const { rows: cols } = await this.db.query(`SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND column_name IN ('ogr_fid', 'dc_id', 'keterangan', 'zona', 'lokasi', 'elevation')`, [table]);
    const available = new Set(cols.map(row => row.column_name));
    const selected = ['ogr_fid AS id', 'dc_id', 'keterangan', 'zona', 'lokasi', 'elevation']
      .filter(column => available.has(column.split(' AS ')[0]));
    if (!selected.length) throw new HttpException({ error: 'Tabel marker tidak memiliki kolom metadata yang valid' }, HttpStatus.INTERNAL_SERVER_ERROR);
    const { rows } = await this.db.query(`SELECT ${selected.join(', ')} FROM ${table} WHERE ogr_fid = $1`, [id]);
    if (!rows.length) throw new HttpException({ error: 'Marker tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { ...rows[0], tipe: type };
  }

  async create(body: Record<string, unknown>) {
    const type = String(body.tipe || '');
    const table = this.table(type);
    const wkt = this.coordinates(body);
    if (!wkt) throw new HttpException({ error: 'Koordinat tidak valid' }, HttpStatus.BAD_REQUEST);
    if (!table) throw new HttpException({ error: 'Tipe marker tidak terdaftar' }, HttpStatus.BAD_REQUEST);
    const columns = ['shape', 'dc_id'];
    const values: unknown[] = [wkt, body.dc_id];
    for (const column of ['keterangan', 'zona', 'lokasi', 'elevation']) {
      if (body[column] !== null && body[column] !== undefined) { columns.push(column); values.push(body[column]); }
    }
    const placeholders = columns.map((_, index) => index === 0 ? 'ST_GeomFromText($1, 4326)' : `$${index + 1}`).join(', ');
    const { rows } = await this.db.query(`INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) RETURNING ogr_fid`, values);
    return { id: rows[0].ogr_fid, ogr_fid: rows[0].ogr_fid, success: true, message: `Marker ${type} berhasil disimpan` };
  }

  async update(type: string, id: string, body: Record<string, unknown>) {
    const table = this.table(type);
    const wkt = this.coordinates(body);
    if (!table) throw new HttpException({ error: 'Tipe tidak valid' }, HttpStatus.BAD_REQUEST);
    if (!wkt) throw new HttpException({ error: 'Koordinat wajib [lat, lng]' }, HttpStatus.BAD_REQUEST);
    const result = await this.db.query(`UPDATE ${table} SET shape = ST_GeomFromText($1, 4326), dc_id = $2, keterangan = $3, zona = $4, lokasi = $5, elevation = $6, tgl_update = CURRENT_TIMESTAMP WHERE ogr_fid = $7`, [wkt, body.dc_id, body.keterangan, body.zona, body.lokasi, body.elevation, id]);
    if (!result.rowCount) throw new HttpException({ error: 'Data tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { success: true, message: `Marker ${type} diperbarui` };
  }

  async remove(type: string, id: string) {
    const table = this.table(type);
    if (!table) throw new HttpException({ error: 'Tipe marker tidak valid' }, HttpStatus.BAD_REQUEST);
    const result = await this.db.query(`DELETE FROM ${table} WHERE ogr_fid = $1`, [id]);
    if (!result.rowCount) throw new HttpException({ error: 'Marker tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { success: true, message: `Marker ${type} berhasil dihapus` };
  }
}
