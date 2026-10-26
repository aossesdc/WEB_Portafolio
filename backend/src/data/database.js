const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const { users: seedUsers } = require('./mockData');

const databasePath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/sla-control.sqlite');
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const database = new Database(databasePath);
database.pragma('journal_mode = WAL');
database.pragma('foreign_keys = ON');
database.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    profile TEXT NOT NULL,
    role TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY,
    client TEXT NOT NULL,
    client_email TEXT NOT NULL,
    contract_hours REAL NOT NULL,
    elapsed_hours REAL NOT NULL DEFAULT 0,
    paused_hours REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'activo',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    risk TEXT NOT NULL,
    branch TEXT,
    category TEXT,
    service TEXT,
    description TEXT,
    priority TEXT,
    assigned_tech TEXT
  );

  CREATE INDEX IF NOT EXISTS tickets_client_email_idx ON tickets(client_email);
  CREATE INDEX IF NOT EXISTS tickets_created_at_idx ON tickets(created_at);
`);

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const passwordHash = crypto.scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${passwordHash.toString('hex')}`;
}

const insertUser = database.prepare(`
  INSERT OR IGNORE INTO users (id, name, email, password_hash, profile, role)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const seedDatabase = database.transaction(() => {
  if (database.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
    seedUsers.forEach(user => insertUser.run(
      user.id,
      user.name,
      user.email,
      hashPassword(user.password),
      user.profile,
      user.role
    ));
  }

});
seedDatabase();

function mapTicket(row) {
  if (!row) return null;
  return {
    id: row.id,
    client: row.client,
    clientEmail: row.clientEmail,
    contractHours: row.contractHours,
    elapsedHours: row.elapsedHours,
    pausedHours: row.pausedHours,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    risk: row.risk,
    branch: row.branch,
    category: row.category,
    service: row.service,
    description: row.description,
    priority: row.priority,
    assignedTech: row.assignedTech
  };
}

const ticketColumns = `
  id, client, client_email AS clientEmail, contract_hours AS contractHours,
  elapsed_hours AS elapsedHours, paused_hours AS pausedHours, status,
  created_at AS createdAt, updated_at AS updatedAt, risk, branch, category,
  service, description, priority, assigned_tech AS assignedTech
`;

function getUserByEmail(email) {
  return database.prepare(`
    SELECT id, name, email, password_hash AS passwordHash, profile, role
    FROM users WHERE email = ? COLLATE NOCASE
  `).get(email);
}

function createSession(token, userId, expiresAt) {
  database.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, expiresAt);
}

function getSessionByToken(token) {
  return database.prepare(`
    SELECT sessions.token, sessions.expires_at AS expiresAt,
      users.id, users.name, users.email, users.profile, users.role
    FROM sessions JOIN users ON users.id = sessions.user_id
    WHERE sessions.token = ?
  `).get(token);
}

function deleteSession(token) {
  database.prepare('DELETE FROM sessions WHERE token = ?').run(token);
}

function getAllTickets() {
  return database.prepare(`SELECT ${ticketColumns} FROM tickets ORDER BY created_at DESC, id DESC`)
    .all()
    .map(mapTicket);
}

function getTicketsByClient(email) {
  return database.prepare(`SELECT ${ticketColumns} FROM tickets WHERE client_email = ? COLLATE NOCASE ORDER BY created_at DESC, id DESC`)
    .all(email)
    .map(mapTicket);
}

function getTicketById(id) {
  return mapTicket(database.prepare(`SELECT ${ticketColumns} FROM tickets WHERE id = ?`).get(id));
}

function insertTicket(ticket) {
  database.prepare(`
    INSERT INTO tickets (
      id, client, client_email, contract_hours, elapsed_hours, paused_hours,
      status, created_at, updated_at, risk, branch, category, service,
      description, priority, assigned_tech
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    ticket.id,
    ticket.client,
    ticket.clientEmail,
    ticket.contractHours,
    ticket.elapsedHours,
    ticket.pausedHours,
    ticket.status,
    ticket.createdAt,
    ticket.updatedAt,
    ticket.risk,
    ticket.branch || null,
    ticket.category || null,
    ticket.service || null,
    ticket.description || null,
    ticket.priority || null,
    ticket.assignedTech || null
  );

  return getTicketById(ticket.id);
}

function updateTicket(id, updates) {
  database.prepare(`
    UPDATE tickets
    SET status = ?, priority = ?, assigned_tech = ?, updated_at = ?
    WHERE id = ?
  `).run(updates.status, updates.priority, updates.assignedTech, new Date().toISOString(), id);
  return getTicketById(id);
}

module.exports = {
  createSession,
  database,
  deleteSession,
  getAllTickets,
  getSessionByToken,
  getTicketById,
  getTicketsByClient,
  getUserByEmail,
  insertTicket,
  updateTicket
};
