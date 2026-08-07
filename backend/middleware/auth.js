function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'Silakan login terlebih dahulu' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.user || req.session.user.role !== 'admin') {
    return res.status(403).json({ error: 'Akses admin diperlukan' });
  }
  next();
}

function requireCronSecret(expectedSecret) {
  return (req, res, next) => {
    if (!expectedSecret || req.get('x-cron-secret') !== expectedSecret) {
      return res.status(401).json({ error: 'Cron secret tidak valid' });
    }
    next();
  };
}

module.exports = { requireLogin, requireAdmin, requireCronSecret };
