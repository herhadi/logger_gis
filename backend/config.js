require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

function required(name) {
  const value = process.env[name];
  if (!value && isProduction) {
    throw new Error(`Environment variable ${name} wajib diisi pada production`);
  }
  return value;
}

module.exports = {
  isProduction,
  port: Number(process.env.PORT) || 4000,
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),
  telegramToken: required('TELEGRAM_TOKEN'),
  adminId: required('ADMIN_ID'),
  baseUrl: process.env.BASE_URL,
  cronSecret: required('CRON_SECRET'),
  corsOrigins: (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
};
