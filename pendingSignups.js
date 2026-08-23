const { pool } = require('./db');

async function createPendingSignup({ ign, email, phone, passwordHash, emailOtp, phoneOtp, expiresAt }) {
  if (!pool) throw new Error('NO_DB');
  // Clear out any earlier unfinished attempt for this email so retries work cleanly.
  await pool.query(`DELETE FROM pending_signups WHERE email = $1`, [email]);
  const res = await pool.query(
    `INSERT INTO pending_signups (ign, email, phone, password_hash, email_otp, phone_otp, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [ign, email, phone, passwordHash, emailOtp, phoneOtp, expiresAt]
  );
  return res.rows[0].id;
}

async function findPendingByEmail(email) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(
    `SELECT * FROM pending_signups WHERE email = $1 AND expires_at > now()`,
    [email]
  );
  return res.rows[0] || null;
}

async function deletePending(id) {
  if (!pool) throw new Error('NO_DB');
  await pool.query(`DELETE FROM pending_signups WHERE id = $1`, [id]);
}

module.exports = { createPendingSignup, findPendingByEmail, deletePending };
