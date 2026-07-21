const { Pool } = require('pg');

// Only connect if DATABASE_URL is set. Without it, the app falls back to
// JSON file storage (see registrations.js) so the site still works during
// local development or before a database is configured.
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }, // required by most hosted Postgres providers (Neon, Render, Supabase)
    })
  : null;

async function initDb() {
  if (!pool) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS registrations (
      id TEXT PRIMARY KEY,
      ign TEXT NOT NULL,
      uid TEXT NOT NULL,
      mode TEXT,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      match_id TEXT,
      payment_id TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE registrations ADD COLUMN IF NOT EXISTS player_id TEXT;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      ign TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Connected to Postgres — registrations and player accounts will persist in the database.');
}

module.exports = { pool, initDb };
