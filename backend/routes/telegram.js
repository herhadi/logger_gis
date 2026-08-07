const express = require('express');
const config = require('../config');

const TELEGRAM_TOKEN = config.telegramToken;
const ADMIN_ID = config.adminId;
const fetch = global.fetch;

function createTelegramRouter(db, requireAdmin, requireCronSecret) {
  const router = express.Router();

// Telegram Bot Setup
// ==========================================
// 1. HELPER FUNCTIONS
// ==========================================
async function kirimTelegram(chatId, pesan) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: pesan,
        parse_mode: 'Markdown'
      })
    });
    return await res.json();
  } catch (err) {
    console.error(`❌ Error Telegram (${chatId}):`, err.message);
  }
}

function formatWaktu(date) {
  if (!date) return "-";
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'Asia/Jakarta'
  }).format(new Date(date));
}

// ==========================================
// 2. WEBHOOK HANDLER (Bot Logic)
// ==========================================
router.post('/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message || !message.text) return res.sendStatus(200);

  const chatId = message.chat.id.toString();
  const text = message.text.trim();
  const username = message.chat.username || message.chat.first_name || 'User';

  try {
    // Gunakan db (Pool pusat)
    const { rows } = await db.query("SELECT * FROM notif_telegram WHERE chat_id = $1", [chatId]);
    const user = rows[0];

    // --- LOGIKA KHUSUS ADMIN ---
    if (chatId === ADMIN_ID) {
      if (text === '/listusers') {
        const { rows: users } = await db.query("SELECT chat_id, username, aktif FROM notif_telegram ORDER BY created_at DESC");
        let daftar = "📋 *Daftar User:*\n\n";
        users.forEach((u, i) => {
          daftar += `${i + 1}. \`${u.chat_id}\` | @${u.username || '-'} | ${u.aktif ? '✅' : '❌'}\n`;
        });
        await kirimTelegram(ADMIN_ID, users.length ? daftar : "📋 Belum ada user.");
        return res.sendStatus(200);
      }

      if (text.startsWith('/approve_')) {
        const target = text.split('_')[1];
        if (!target) return res.sendStatus(200);
        await db.query("UPDATE notif_telegram SET aktif = TRUE WHERE chat_id = $1", [target]);
        await kirimTelegram(ADMIN_ID, `✅ User ${target} telah disetujui.`);
        await kirimTelegram(target, "✅ Akses Anda telah aktif. Gunakan /start untuk mulai.");
        return res.sendStatus(200);
      }

      // Broadcast Logic
      if (text.startsWith('/broadcast ')) {
        const pesanKonten = text.replace('/broadcast ', '').trim();
        const { rows: targets } = await db.query("SELECT chat_id FROM notif_telegram WHERE aktif = TRUE");
        for (const target of targets) {
          await kirimTelegram(target.chat_id, `📢 *BROADCAST*\n\n${pesanKonten}`);
        }
        await kirimTelegram(ADMIN_ID, `📢 Terkirim ke ${targets.length} user.`);
        return res.sendStatus(200);
      }
    }

    // --- LOGIKA PENDAFTARAN USER ---
    if (!user) {
      await db.query("INSERT INTO notif_telegram (chat_id, username, aktif) VALUES ($1, $2, FALSE)", [chatId, username]);
      await kirimTelegram(chatId, "⏳ ID Anda terdaftar. Menunggu persetujuan admin.");
      await kirimTelegram(ADMIN_ID, `🔔 *User Baru Daftar*:\nID: \`${chatId}\`\nUser: @${username}\n\nApprove: /approve_${chatId}`);
      return res.sendStatus(200);
    }

    if (!user.aktif) {
      return kirimTelegram(chatId, "🚫 Akses Anda belum disetujui admin.");
    }

    // --- COMMAND UMUM ---
    switch (text) {
      case '/start':
        await kirimTelegram(chatId, `Halo *${username}*! 👋\nBot pemantau logger aktif.`);
        break;
      case '/check':
        const statusMsg = await getStatusLogger();
        await kirimTelegram(chatId, statusMsg);
        break;
      case '/help':
        await kirimTelegram(chatId, "❓ *Perintah*:\n/check - Status saat ini\n/help - Bantuan");
        break;
      default:
        await kirimTelegram(chatId, "✅ Gunakan /check untuk melihat status logger.");
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("Webhook Error:", err);
    res.sendStatus(500);
  }
});

// ==========================================
// 3. LOGIKA MONITORING (CORE)
// ==========================================
async function getStatusLogger() {
  const query = `
    SELECT l.idmet, l.nama, ll.jam 
    FROM logger_lokasi l
    LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
    WHERE l.skip_monitor = FALSE
  `;

  const { rows } = await db.query(query);

  const now = new Date();
  let offline = [];
  let onlineCount = 0;

  rows.forEach((row, index) => {
    const selisihJam = row.jam
      ? (now - new Date(row.jam)) / (1000 * 60 * 60)
      : Infinity;

    // const delay = row.jam
    //   ? Math.floor((now - new Date(row.jam)) / (1000 * 60))
    //   : '-';

    if (selisihJam > 1) {
      // offline.push(
      //   `🔴 ${offline.length + 1}. ${row.nama} (${row.idmet})\n` +
      //   `   Data terakhir: ${formatWaktu(row.jam)} (${delay} menit lalu)`
      // );
       offline.push(
        `🔴 ${offline.length + 1}. ${row.nama} (${row.idmet})\n` +
        `   Data terakhir: ${formatWaktu(row.jam)}`
      );
    } else {
      onlineCount++;
    }
  });

  return (
    `📊 *Status Logger Saat Ini*\n` +
    `⏱ ${formatWaktu(now)}\n\n` +
    (offline.length
      ? `⚠️ *OFFLINE (>1 jam)*\n\n${offline.join('\n\n')}\n\n`
      : `✅ Semua Online\n\n`) +
    `🟢 *ONLINE*: ${onlineCount} logger`
  );
}

async function cekLoggerDanNotif() {
  try {
    const query = `
      SELECT l.idmet, l.nama, ll.jam,
             CASE WHEN ll.jam < NOW() - INTERVAL '1 hour' OR ll.jam IS NULL THEN 'OFFLINE' ELSE 'ONLINE' END as status_skr,
             ns.status_terakhir as status_lama
      FROM logger_lokasi l
      LEFT JOIN logger_latest ll ON l.idmet = ll.idmet
      LEFT JOIN notif_status ns ON l.idmet = ns.idmet
      WHERE l.skip_monitor = FALSE
    `;
    const { rows } = await db.query(query);
    let alerts = [];

    for (const r of rows) {
      if (r.status_skr !== r.status_lama) {
        // Simpan status baru ke notif_status
        await db.query(
          `INSERT INTO notif_status (idmet, status_terakhir, last_change) 
           VALUES ($1, $2, NOW()) 
           ON CONFLICT (idmet) 
           DO UPDATE SET status_terakhir = EXCLUDED.status_terakhir, last_change = NOW()`,
          [r.idmet, r.status_skr]
        );
        const icon = r.status_skr === 'OFFLINE' ? '🔴' : '🟢';
        alerts.push(`${icon} *${r.status_skr}*: ${r.nama}\nJam: ${formatWaktu(r.jam)}`);
      }
    }

    if (alerts.length > 0) {
      const { rows: users } = await db.query("SELECT chat_id FROM notif_telegram WHERE aktif = TRUE");
      const pesan = alerts.join('\n\n');
      for (const u of users) {
        await kirimTelegram(u.chat_id, pesan);
      }
    }
  } catch (err) {
    console.error("Cron Error:", err.message);
  }
}

// ==========================================
// 4. CRON SCHEDULE
// ==========================================
// cron.schedule('*/10 * * * *', () => {
//   cekLoggerDanNotif();
// }); // Dialihkan ke endpoint /api/cron dan hit menggunakan UptimeRobot

// === API TESTING TELEGRAM ===
router.get('/api/test-telegram', requireAdmin, async (req, res) => {
  await kirimTelegram(process.env.ADMIN_ID, "✅ Test notif dari server Render berhasil!");
  res.send("OK");
});

router.get('/api/test-monitor', requireAdmin, async (req, res) => {
  await cekLoggerDanNotif();
  res.send("Monitor executed");
});

router.get('/api/set-webhook', requireAdmin, async (req, res) => {
  try {
    const webhookUrl = `${config.baseUrl}/webhook`;

    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/setWebhook`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: webhookUrl })
      }
    );

    const data = await response.json();

    console.log("📡 Set webhook:", data);

    res.json({
      success: true,
      webhook: webhookUrl,
      telegram: data
    });

  } catch (err) {
    console.error("❌ Set webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/webhook-info', requireAdmin, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/getWebhookInfo`
    );

    const data = await response.json();

    console.log("🔍 Webhook info:", data);

    res.json(data);

  } catch (err) {
    console.error("❌ Get webhook error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/delete-webhook', requireAdmin, async (req, res) => {
  try {
    const response = await fetch(
      `https://api.telegram.org/bot${process.env.TELEGRAM_TOKEN}/deleteWebhook`
    );

    const data = await response.json();

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let lastRun = 0;

// Endpoint untuk trigger cron manual (juga bisa untuk keep-alive)
// dengan rate limit 10 menit sekali di UptimeRobot
router.get('/api/cron', requireCronSecret, async (req, res) => {
  console.log("🚀 Cron jalan:", new Date());

  res.send("OK"); // response cepat

  try {
    await cekLoggerDanNotif();
  } catch (err) {
    console.error("❌ Cron error:", err.message);

    await kirimTelegram(process.env.ADMIN_ID,
      `🚨 CRON ERROR\n${err.message}`
    );
  }
});


  return router;
}

module.exports = { createTelegramRouter };

