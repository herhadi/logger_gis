const express = require('express');
const cors = require('cors');
const path = require('path');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const bcrypt = require('bcrypt');
const cron = require('node-cron');
const fs = require('fs');
const config = require('./config');
const { errorHandler } = require('./middleware/error-handler');

const isProduction = config.isProduction;
const TELEGRAM_TOKEN = config.telegramToken;
const ADMIN_ID = config.adminId;

// Gunakan node-fetch jika versi Node.js kamu di bawah 18, 
// tapi di Railway (Node 18+) fetch sudah global.
const fetch = global.fetch;

// Kita hanya butuh dbPostgres sekarang
const { dbPostgres } = require('./db');
const {
  getMarkerTable,
  isValidCoordinates,
  coordinatesToWkt,
  markerUnionSql
} = require('./utils/marker');
const { createMarkerRouter } = require('./routes/marker');
const { createPolygonRouter, createSelectionRouter } = require('./routes/polygon');
const { createPipaRouter } = require('./routes/pipa');
const { createAuthRouter } = require('./routes/auth');
const { createTelegramRouter } = require('./routes/telegram');
const {
  requireLogin,
  requireAdmin,
  requireCronSecret
} = require('./middleware/auth');

const app = express();

// PENTING: Trust proxy untuk HTTPS Railway agar cookie 'secure: true' terkirim
app.set('trust proxy', 1);

app.use(cors({
  origin(origin, callback) {
    if (!origin || config.corsOrigins.length === 0 || config.corsOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error('Origin tidak diizinkan oleh CORS'));
  },
  credentials: true
}));
app.use(express.json());

// === KONFIGURASI SESSION POSTGRESQL ===
app.use(session({
  store: new pgSession({
    pool: dbPostgres,
    tableName: 'session',
    createTableIfMissing: false
  }),
  key: 'session_cookie',
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 24 * 60 * 60 * 1000, // 1 hari
    // DI LOKAL (HTTP): Wajib false agar cookie tersimpan
    // DI RAILWAY (HTTPS): Wajib true agar aman
    secure: isProduction,
    // DI LOKAL: 'lax' sudah cukup
    // DI RAILWAY: 'none' jika frontend & backend beda domain
    sameSite: isProduction ? 'none' : 'lax',
    httpOnly: true
  }
}));

app.use('/api/marker', createMarkerRouter(dbPostgres, requireLogin));
app.use('/api/polygon', createPolygonRouter(dbPostgres, requireLogin));
app.use('/api/selection', createSelectionRouter(dbPostgres));
app.use('/api/pipa', createPipaRouter(dbPostgres, requireLogin));
app.use('/api', createAuthRouter(dbPostgres));
app.use('/', createTelegramRouter(dbPostgres, requireAdmin, requireCronSecret(config.cronSecret)));

// === STATIC FILES (PRODUCTION) ===
app.use(express.static(path.join(__dirname, '../frontend')));
// === Redirect root ke login.html ===
app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.use(errorHandler);

// === START SERVER ===

module.exports = app;

