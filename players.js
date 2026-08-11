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

async function updatePassword(email, passwordHash) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`UPDATE players SET password_hash = $1 WHERE email = $2 RETURNING id`, [passwordHash, email]);
  if (res.rowCount === 0) throw new Error('Player not found.');
}

// ---- Password reset OTPs ----

async function createPasswordReset(email, otp, expiresAt) {
  if (!pool) throw new Error('NO_DB');
  // Invalidate any earlier unused OTPs for this email first.
  await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
  await pool.query(
    `INSERT INTO password_resets (email, otp, expires_at) VALUES ($1,$2,$3)`,
    [email, otp, expiresAt]
  );
}

async function findValidReset(email, otp) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(
    `SELECT * FROM password_resets WHERE email = $1 AND otp = $2 AND expires_at > now()`,
    [email, otp]
  );
  return res.rows[0] || null;
}

async function deleteResetsForEmail(email) {
  if (!pool) throw new Error('NO_DB');
  await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
}

async function countPlayers() {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`SELECT COUNT(*)::int AS count FROM players`);
  return res.rows[0].count;
}

module.exports = {
  createPlayer,
  findByEmail,
  findById,
  updatePassword,
  createPasswordReset,
  findValidReset,
  deleteResetsForEmail,
  countPlayers,
};
