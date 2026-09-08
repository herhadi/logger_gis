import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class PipaService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async findAll(bbox?: string, zoom?: string) {
    const level = Number(zoom);
    const tolerance = Number.isFinite(level) && level < 14 ? 0.0002 : Number.isFinite(level) && level < 16 ? 0.00008 : 0;
    let sql = `SELECT ogr_fid AS id, diameter, ST_AsGeoJSON(ST_FlipCoordinates(CASE WHEN $1::float > 0 THEN ST_SimplifyPreserveTopology(shape, $1::float) ELSE shape END))::json->'coordinates' AS geometry FROM gis_pipa`;
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
    const query = `WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS tile) SELECT COALESCE(ST_AsMVT(tile_data, 'pipa', 4096, 'geom'), ''::bytea) AS tile FROM (SELECT ogr_fid AS id, diameter, ST_AsMVTGeom(ST_Transform(shape, 3857), bounds.tile, 4096, 64, TRUE) AS geom FROM gis_pipa CROSS JOIN bounds WHERE shape && ST_Transform(bounds.tile, 4326) AND ST_Intersects(shape, ST_Transform(bounds.tile, 4326))) AS tile_data WHERE geom IS NOT NULL`;
    const { rows } = await this.db.query(query, [z, x, y]);
    return rows[0]?.tile || Buffer.alloc(0);
  }

  async options() {
    const [diameter, jenis] = await Promise.all([
      this.db.query('SELECT DISTINCT diameter FROM gis_pipa WHERE diameter IS NOT NULL ORDER BY diameter DESC'),
      this.db.query('SELECT DISTINCT jenis FROM gis_pipa WHERE jenis IS NOT NULL ORDER BY jenis ASC')
    ]);
    return { diameter: diameter.rows.map(row => row.diameter), jenis: jenis.rows.map(row => row.jenis) };
  }

  private cleanNumber(value: unknown) {
    if (value === undefined || value === null || value === '') return null;
    const number = parseFloat(String(value).replace(/[^\d.-]/g, ''));
    return Number.isNaN(number) ? null : number;
  }

  private values(body: Record<string, unknown>, wkt: string) {
    return [wkt, body.dc_id || null, this.cleanNumber(body.dia), body.jenis || null, this.cleanNumber(body.panjang), body.keterangan || null, body.lokasi || null, body.status || null, this.cleanNumber(body.diameter), this.cleanNumber(body.roughness), body.zona || null];
  }

  private lineWkt(coords: unknown) {
    if (!Array.isArray(coords) || coords.length < 2 || coords.some(point => !Array.isArray(point) || point.length < 2 || point.slice(0, 2).some(value => !Number.isFinite(Number(value))))) return null;
    return `LINESTRING(${coords.map(([lat, lng]) => `${lng} ${lat}`).join(',')})`;
  }

  async findOne(id: string) {
    const { rows } = await this.db.query(`SELECT ogr_fid AS id, dc_id, dia, jenis, panjang AS panjang_input, ROUND(ST_Length(shape::geography)) AS panjang_hitung, keterangan, lokasi, status, diameter, roughness, zona FROM gis_pipa WHERE ogr_fid = $1`, [id]);
    if (!rows.length) throw new HttpException({ error: 'Pipa tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return rows[0];
  }

  async create(body: Record<string, unknown>) {
    const wkt = this.lineWkt(body.coords);
    if (!wkt) throw new HttpException({ error: 'Data koordinat tidak valid (minimal 2 titik)' }, HttpStatus.BAD_REQUEST);
    const { rows } = await this.db.query(`INSERT INTO gis_pipa (shape, dc_id, dia, jenis, panjang, keterangan, lokasi, status, diameter, roughness, zona) VALUES (ST_GeomFromText($1, 4326), $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING ogr_fid`, this.values(body, wkt));
    return { ogr_fid: rows[0].ogr_fid, success: true, message: 'Pipa berhasil disimpan' };
  }

  async update(id: string, body: Record<string, unknown>) {
    const wkt = this.lineWkt(body.coords);
    if (!wkt) throw new HttpException({ error: 'Data koordinat tidak valid' }, HttpStatus.BAD_REQUEST);
    const result = await this.db.query(`UPDATE gis_pipa SET shape=ST_GeomFromText($1, 4326), dc_id=$2, dia=$3, jenis=$4, panjang=$5, keterangan=$6, lokasi=$7, status=$8, diameter=$9, roughness=$10, zona=$11 WHERE ogr_fid=$12`, [...this.values(body, wkt), id]);
    if (!result.rowCount) throw new HttpException({ error: 'Pipa tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { success: true, message: 'Pipa berhasil diperbarui' };
  }

  async remove(id: string) {
    const result = await this.db.query('DELETE FROM gis_pipa WHERE ogr_fid = $1', [id]);
    if (!result.rowCount) throw new HttpException({ error: 'Pipa tidak ditemukan' }, HttpStatus.NOT_FOUND);
    return { success: true, message: 'Pipa berhasil dihapus' };
  }
}
