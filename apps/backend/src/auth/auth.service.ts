import { Injectable, InternalServerErrorException, UnauthorizedException, Inject } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class AuthService {
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async login(username: string, password: string, session: any) {
    const { rows } = await this.db.query('SELECT * FROM users WHERE username = $1', [username]);
    if (!rows.length) throw new UnauthorizedException('User tidak ditemukan');
    const user = rows[0];
    if (!await bcrypt.compare(password, user.password)) throw new UnauthorizedException('Password salah');

    const loginResult = await this.db.query('UPDATE users SET last_login = NOW() WHERE id = $1 RETURNING last_login', [user.id]);
    const lastLogin = loginResult.rows[0]?.last_login || user.last_login || null;
    session.user = { id: user.id, username: user.username, role: user.role, last_login: lastLogin };
    await new Promise<void>((resolve, reject) => session.save((error: Error | null) => error ? reject(error) : resolve()));
    return { redirect: user.role === 'admin' ? '/admin.html' : '/user.html' };
  }

  async sessionUser(session: any) {
    if (!session?.user) throw new UnauthorizedException('Unauthorized');
    try {
      const { rows } = await this.db.query('SELECT last_login FROM users WHERE id = $1', [session.user.id]);
      session.user.last_login = rows[0]?.last_login || null;
    } catch (error) {
      console.error('Gagal ambil session user detail:', error);
    }
    return { user: session.user };
  }

  async logout(session: any) {
    if (!session) return;
    await new Promise<void>((resolve, reject) => session.destroy((error: Error | null) => error ? reject(error) : resolve()));
  }
}
