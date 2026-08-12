const { pool } = require('./db');

// Wallet requires Postgres, same as player accounts — real money balances
// have no business living in a flat JSON file.
//
// Two separate balances are tracked per player:
//  - wallet_balance: real winnings, withdrawable to UPI/bank
//  - bonus_balance:  signup/promo bonus, NOT withdrawable (display only for now)

async function getWallet(playerId) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`SELECT wallet_balance, bonus_balance FROM players WHERE id = $1`, [playerId]);
  if (res.rowCount === 0) return null;
  return {
    balance: Number(res.rows[0].wallet_balance),
    bonusBalance: Number(res.rows[0].bonus_balance),
  };
}

async function getTransactions(playerId, limit = 30) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(
    `SELECT id, type, amount, note, balance_type AS "balanceType", created_at AS "createdAt" FROM wallet_transactions
     WHERE player_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [playerId, limit]
  );
  return res.rows;
}

// Credits (positive amount) or debits (negative amount) a player's
// WITHDRAWABLE wallet balance (real winnings) and logs the transaction.
async function adjustWallet(playerId, amount, type, note) {
  if (!pool) throw new Error('NO_DB');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE players SET wallet_balance = wallet_balance + $1 WHERE id = $2 RETURNING wallet_balance`,
      [amount, playerId]
    );
    if (upd.rowCount === 0) throw new Error('Player not found.');
    await client.query(
      `INSERT INTO wallet_transactions (player_id, type, amount, note, balance_type) VALUES ($1,$2,$3,$4,'wallet')`,
      [playerId, type, amount, note || null]
    );
    await client.query('COMMIT');
    return Number(upd.rows[0].wallet_balance);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Credits the NON-withdrawable bonus balance (e.g. signup bonus).
async function adjustBonus(playerId, amount, type, note) {
  if (!pool) throw new Error('NO_DB');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      `UPDATE players SET bonus_balance = bonus_balance + $1 WHERE id = $2 RETURNING bonus_balance`,
      [amount, playerId]
    );
    if (upd.rowCount === 0) throw new Error('Player not found.');
    await client.query(
      `INSERT INTO wallet_transactions (player_id, type, amount, note, balance_type) VALUES ($1,$2,$3,$4,'bonus')`,
      [playerId, type, amount, note || null]
    );
    await client.query('COMMIT');
    return Number(upd.rows[0].bonus_balance);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function findPlayerByEmailOrUid(identifier) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(
    `SELECT id, ign, email, wallet_balance, bonus_balance FROM players WHERE email = $1`,
    [identifier]
  );
  return res.rows[0] || null;
}

// Lists all players together with the Free Fire UID(s) they've registered
// with, so the admin can look someone up by UID (which is what they'll
// recognise from match results) rather than needing their email by heart.
async function listPlayersWithUids() {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`
    SELECT p.id AS "walletId", p.ign, p.email, p.wallet_balance AS "walletBalance",
           p.bonus_balance AS "bonusBalance", p.blocked,
           COALESCE(array_agg(DISTINCT r.uid) FILTER (WHERE r.uid IS NOT NULL), '{}') AS uids
    FROM players p
    LEFT JOIN registrations r ON r.player_id = p.id
    GROUP BY p.id, p.ign, p.email, p.wallet_balance, p.bonus_balance, p.blocked
    ORDER BY p.created_at DESC
  `);
  return res.rows;
}

async function createWithdrawalRequest(playerId, amount, upiId) {
  if (!pool) throw new Error('NO_DB');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const playerRes = await client.query(`SELECT wallet_balance FROM players WHERE id = $1 FOR UPDATE`, [playerId]);
    if (playerRes.rowCount === 0) throw new Error('Player not found.');
    const balance = Number(playerRes.rows[0].wallet_balance);
    if (amount > balance) {
      await client.query('ROLLBACK');
      const err = new Error('Insufficient wallet balance.');
      err.code = 'INSUFFICIENT_FUNDS';
      throw err;
    }
    await client.query(`UPDATE players SET wallet_balance = wallet_balance - $1 WHERE id = $2`, [amount, playerId]);
    await client.query(
      `INSERT INTO wallet_transactions (player_id, type, amount, note, balance_type) VALUES ($1,'withdrawal_hold',$2,'Held pending admin payout','wallet')`,
      [playerId, -amount]
    );
    const reqRes = await client.query(
      `INSERT INTO withdrawal_requests (player_id, amount, upi_id, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
      [playerId, amount, upiId || null]
    );
    await client.query('COMMIT');
    return reqRes.rows[0].id;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function listWithdrawals() {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(`
    SELECT w.id, w.player_id AS "playerId", w.amount, w.upi_id AS "upiId", w.status,
           w.created_at AS "createdAt", w.processed_at AS "processedAt",
           p.ign, p.email, p.phone
    FROM withdrawal_requests w
    JOIN players p ON p.id = w.player_id
    ORDER BY w.created_at DESC
  `);
  return res.rows;
}

async function markWithdrawalPaid(id) {
  if (!pool) throw new Error('NO_DB');
  const res = await pool.query(
    `UPDATE withdrawal_requests SET status = 'paid', processed_at = now() WHERE id = $1 AND status = 'pending' RETURNING player_id, amount`,
    [id]
  );
  if (res.rowCount === 0) throw new Error('Request not found or already processed.');
  return res.rows[0];
}

async function rejectWithdrawal(id) {
  if (!pool) throw new Error('NO_DB');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `UPDATE withdrawal_requests SET status = 'rejected', processed_at = now() WHERE id = $1 AND status = 'pending' RETURNING player_id, amount`,
      [id]
    );
    if (res.rowCount === 0) throw new Error('Request not found or already processed.');
    const { player_id: playerId, amount } = res.rows[0];
    await client.query(`UPDATE players SET wallet_balance = wallet_balance + $1 WHERE id = $2`, [amount, playerId]);
    await client.query(
      `INSERT INTO wallet_transactions (player_id, type, amount, note, balance_type) VALUES ($1,'withdrawal_rejected',$2,'Refunded — request rejected','wallet')`,
      [playerId, amount]
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

module.exports = {
  getWallet,
  getTransactions,
  adjustWallet,
  adjustBonus,
  findPlayerByEmailOrUid,
  listPlayersWithUids,
  createWithdrawalRequest,
  listWithdrawals,
  markWithdrawalPaid,
  rejectWithdrawal,
};
