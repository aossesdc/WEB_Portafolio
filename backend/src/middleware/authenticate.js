const { deleteSession, getSessionByToken } = require('../data/database');

function authenticate(req, res, next) {
  const authorization = req.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ ok: false, message: 'Inicia sesión para continuar.' });
  }

  const session = getSessionByToken(token);
  if (!session || Date.parse(session.expiresAt) <= Date.now()) {
    if (session) deleteSession(token);
    return res.status(401).json({ ok: false, message: 'La sesión expiró. Inicia sesión nuevamente.' });
  }

  req.user = {
    id: session.id,
    name: session.name,
    email: session.email,
    profile: session.profile,
    role: session.role
  };
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ ok: false, message: 'No tienes permisos para esta operación.' });
    }
    next();
  };
}

module.exports = { authenticate, requireRole };
