const { pool } = require('./db');

// Player accounts require Postgres — passwords should never live in a plain
// JSON file, so unlike registrations there is no file-based fallback here.
// Routes using this module should catch the 'NO_DB' error and return a clear
// 503 telling the admin to set DATABASE_URL.

async function createPlayer({ id, ign, email, phone, passwordHash }) {
  if (!pool) throw new Error('NO_DB');
  await pool.query(
    `INSERT INTO players (id, ign, email, phone, password_hash) VALUES ($1,$2,$3,$4,$5)`,
    [id, ign, email, phone, passwordHash]
  );
}

async function findByEmail(email) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`SELECT * FROM players WHERE email = $1`, [email]);
  return res.rows[0] || null;
}

async function findById(id) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`SELECT id, ign, email, phone FROM players WHERE id = $1`, [id]);
  return res.rows[0] || null;
}

module.exports = { createPlayer, findByEmail, findById };
