const express = require('express');
const crypto = require('crypto');
const { users } = require('../data/mockData');

const router = express.Router();

function createSessionToken(user) {
  return crypto.createHash('sha256')
    .update(`${user.email}:${user.role}:${Date.now()}:${Math.random()}`)
    .digest('hex');
}

router.post('/login', (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ ok: false, message: 'Email y contraseña son obligatorios.' });
  }

  const user = users.find(item => item.email.toLowerCase() === String(email).trim().toLowerCase() && item.password === password);

  if (!user) {
    return res.status(401).json({ ok: false, message: 'Credenciales inválidas.' });
  }

  const token = createSessionToken(user);

  return res.json({
    ok: true,
    sessionToken: token,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
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
