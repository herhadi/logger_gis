import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { DATABASE_POOL } from '../database/database.module';

@Injectable()
export class TelegramService {
  private readonly token = process.env.TELEGRAM_TOKEN || '';
  private readonly adminId = process.env.ADMIN_ID || '';
  private readonly cronSecret = process.env.CRON_SECRET || '';
  constructor(@Inject(DATABASE_POOL) private readonly db: Pool) {}

  async telegramRequest(method: string, body?: Record<string, unknown>) {
    const response = await fetch(`https://api.telegram.org/bot${this.token}/${method}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
    return response.json();
  }

  async send(chatId: string, text: string) { return this.telegramRequest('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' }); }

  async webhook(payload: any) {
    const message = payload?.message;
    if (!message?.text) return;
    const chatId = String(message.chat.id);
    const text = String(message.text).trim();
    const username = message.chat.username || message.chat.first_name || 'User';
    const { rows } = await this.db.query('SELECT * FROM notif_telegram WHERE chat_id = $1', [chatId]);
    if (chatId === this.adminId && text === '/listusers') {
      const { rows: users } = await this.db.query('SELECT chat_id, username, aktif FROM notif_telegram ORDER BY created_at DESC');
      const list = users.map((user, index) => `${index + 1}. \`${user.chat_id}\` | @${user.username || '-'} | ${user.aktif ? '✅' : '❌'}`).join('\n');
      await this.send(chatId, users.length ? `📋 *Daftar User:*\n\n${list}` : '📋 Belum ada user.');
      return;
    }
    if (chatId === this.adminId && text.startsWith('/approve_')) {
      const target = text.slice('/approve_'.length).trim();
      if (target) {
        await this.db.query('UPDATE notif_telegram SET aktif = TRUE WHERE chat_id = $1', [target]);
        await this.send(chatId, `✅ User ${target} telah disetujui.`);
        await this.send(target, '✅ Akses Anda telah aktif. Gunakan /start untuk mulai.');
      }
      return;
    }
    if (chatId === this.adminId && text.startsWith('/broadcast ')) {
      const content = text.slice('/broadcast '.length).trim();
      const { rows: targets } = await this.db.query('SELECT chat_id FROM notif_telegram WHERE aktif = TRUE');
      for (const target of targets) await this.send(target.chat_id, `📢 *BROADCAST*\n\n${content}`);
      await this.send(chatId, `📢 Terkirim ke ${targets.length} user.`);
      return;
    }
    if (!rows[0]) {
      await this.db.query('INSERT INTO notif_telegram (chat_id, username, aktif) VALUES ($1, $2, FALSE)', [chatId, username]);
      await this.send(chatId, '⏳ ID Anda terdaftar. Menunggu persetujuan admin.');
      await this.send(this.adminId, `🔔 *User Baru Daftar*:\nID: \`${chatId}\`\nUser: @${username}\n\nApprove: /approve_${chatId}`);
      return;
    }
    if (!rows[0].aktif) { await this.send(chatId, '🚫 Akses Anda belum disetujui admin.'); return; }
    if (text === '/start') await this.send(chatId, `Halo *${username}*! 👋\nBot pemantau logger aktif.`);
    else if (text === '/check') await this.send(chatId, await this.statusLogger());
    else if (text === '/help') await this.send(chatId, '❓ *Perintah*:\n/check - Status saat ini\n/help - Bantuan');
    else await this.send(chatId, '✅ Gunakan /check untuk melihat status logger.');
  }

  private async statusLogger() {
    const { rows } = await this.db.query('SELECT l.idmet, l.nama, ll.jam FROM logger_lokasi l LEFT JOIN logger_latest ll ON l.idmet = ll.idmet WHERE l.skip_monitor = FALSE');
    const now = new Date(); const offline = rows.filter(row => !row.jam || now.getTime() - new Date(row.jam).getTime() > 3600000);
    return `📊 *Status Logger Saat Ini*\n⏱ ${now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}\n\n${offline.length ? `⚠️ *OFFLINE*: ${offline.length} logger` : '✅ Semua Online'}\n🟢 *ONLINE*: ${rows.length - offline.length} logger`;
  }

  async checkLoggerAndNotify() {
    const { rows } = await this.db.query(`SELECT l.idmet, l.nama, ll.jam, CASE WHEN ll.jam < NOW() - INTERVAL '1 hour' OR ll.jam IS NULL THEN 'OFFLINE' ELSE 'ONLINE' END AS status_skr, ns.status_terakhir AS status_lama FROM logger_lokasi l LEFT JOIN logger_latest ll ON l.idmet = ll.idmet LEFT JOIN notif_status ns ON l.idmet = ns.idmet WHERE l.skip_monitor = FALSE`);
    const alerts: string[] = [];
    for (const row of rows) {
      if (row.status_skr === row.status_lama) continue;
      await this.db.query(`INSERT INTO notif_status (idmet, status_terakhir, last_change) VALUES ($1, $2, NOW()) ON CONFLICT (idmet) DO UPDATE SET status_terakhir = EXCLUDED.status_terakhir, last_change = NOW()`, [row.idmet, row.status_skr]);
      alerts.push(`${row.status_skr === 'OFFLINE' ? '🔴' : '🟢'} *${row.status_skr}*: ${row.nama}\nJam: ${row.jam || '-'}`);
    }
    if (alerts.length) {
      const { rows: users } = await this.db.query('SELECT chat_id FROM notif_telegram WHERE aktif = TRUE');
      const message = alerts.join('\n\n');
      for (const user of users) await this.send(user.chat_id, message);
    }
    return { success: true, alerts: alerts.length };
  }
  async testTelegram() { await this.send(this.adminId, '✅ Test notif dari server NestJS berhasil!'); return 'OK'; }
  async setWebhook() { const webhook = `${process.env.BASE_URL || ''}/webhook`; return { success: true, webhook, telegram: await this.telegramRequest('setWebhook', { url: webhook }) }; }
  async runCron(secret: string) { if (!this.cronSecret || secret !== this.cronSecret) throw new HttpException({ error: 'Cron secret tidak valid' }, HttpStatus.UNAUTHORIZED); return this.checkLoggerAndNotify(); }
}
