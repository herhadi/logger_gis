function errorHandler(err, req, res, next) {
  console.error(`${req.method} ${req.originalUrl}:`, err);

  if (res.headersSent) return next(err);

  return res.status(err.statusCode || 500).json({
    error: err.statusCode ? err.message : 'Terjadi kesalahan pada server'
  });
}

module.exports = { errorHandler };
