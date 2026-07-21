const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const JSON_PATH = path.join(__dirname, 'data', 'registrations.json');

function readJsonRegs() {
  if (!fs.existsSync(JSON_PATH)) {
    fs.writeFileSync(JSON_PATH, '[]');
    return [];
  }
  try {
    return JSON.parse(fs.readFileSync(JSON_PATH, 'utf-8'));
  } catch (e) {
    return [];
  }
}

function writeJsonRegs(data) {
  fs.writeFileSync(JSON_PATH, JSON.stringify(data, null, 2));
}

async function addRegistration(entry) {
  if (pool) {
    await pool.query(
      `INSERT INTO registrations (id, player_id, ign, uid, mode, email, phone, match_id, payment_id, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [entry.id, entry.playerId || null, entry.ign, entry.uid, entry.mode, entry.email, entry.phone, entry.matchId, entry.paymentId, entry.createdAt]
    );
  } else {
    const regs = readJsonRegs();
    regs.push(entry);
    writeJsonRegs(regs);
  }
}

async function findDuplicate(uid, matchId) {
  if (pool) {
    const res = await pool.query(
      `SELECT 1 FROM registrations WHERE uid = $1 AND match_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [uid, matchId || null]
    );
    return res.rowCount > 0;
  } else {
    const regs = readJsonRegs();
    return regs.some(r => r.uid === uid && r.matchId === (matchId || null));
  }
}

async function countRegistrations() {
  if (pool) {
    const res = await pool.query(`SELECT COUNT(*)::int AS count FROM registrations`);
    return res.rows[0].count;
  } else {
    return readJsonRegs().length;
  }
}

async function allRegistrations() {
  if (pool) {
    const res = await pool.query(
      `SELECT id, player_id AS "playerId", ign, uid, mode, email, phone, match_id AS "matchId", payment_id AS "paymentId", created_at AS "createdAt"
       FROM registrations ORDER BY created_at DESC`
    );
    return res.rows;
  } else {
    return readJsonRegs().slice().reverse();
  }
}

module.exports = { addRegistration, findDuplicate, countRegistrations, allRegistrations };
