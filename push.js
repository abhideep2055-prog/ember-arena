const { pool } = require('./db');

// Push notifications require Postgres, same as player accounts — there's
// nowhere sensible to keep subscriptions or "already notified" state in a
// flat JSON file across server restarts.

async function saveSubscription(playerId, subscription) {
  if (!pool) throw new Error('NO_DB');
  const { endpoint, keys } = subscription;
  await pool.query(
    `INSERT INTO push_subscriptions (player_id, endpoint, p256dh, auth)
     VALUES ($1,$2,$3,$4)
     ON CONFLICT (endpoint) DO UPDATE SET player_id = EXCLUDED.player_id`,
    [playerId, endpoint, keys.p256dh, keys.auth]
  );
}

async function removeSubscription(endpoint) {
  if (!pool) return;
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}

async function getSubscriptionsForPlayers(playerIds) {
  if (!pool || playerIds.length === 0) return [];
  const res = await pool.query(
    `SELECT player_id AS "playerId", endpoint, p256dh, auth FROM push_subscriptions WHERE player_id = ANY($1)`,
    [playerIds]
  );
  return res.rows;
}

async function wasNotified(matchId) {
  if (!pool) return true; // without a DB we can't safely dedupe, so skip sending rather than spam
  const res = await pool.query(`SELECT 1 FROM sent_notifications WHERE match_id = $1`, [matchId]);
  return res.rowCount > 0;
}

async function markNotified(matchId) {
  if (!pool) return;
  await pool.query(
    `INSERT INTO sent_notifications (match_id) VALUES ($1) ON CONFLICT (match_id) DO NOTHING`,
    [matchId]
  );
}

module.exports = { saveSubscription, removeSubscription, getSubscriptionsForPlayers, wasNotified, markNotified };
