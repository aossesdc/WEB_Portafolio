const express = require('express');
const crypto = require('crypto');
const { createSession, database, getUserByEmail } = require('../data/database');

const router = express.Router();

function verifyPassword(password, passwordHash) {
  const [salt, storedHash] = String(passwordHash || '').split(':');
  if (!salt || !storedHash) return false;
  const expected = Buffer.from(storedHash, 'hex');
  const actual = crypto.scryptSync(password, Buffer.from(salt, 'hex'), 64);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: 'Email y contraseña son obligatorios.' });
  }

  const user = getUserByEmail(String(email).trim());

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(new Date().toISOString());
  createSession(token, user.id, expiresAt);

  return res.json({
    ok: true,
    sessionToken: token,
    expiresAt,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      profile: user.profile,
      role: user.role
    }
  });
});

module.exports = router;
