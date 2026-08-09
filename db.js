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
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS wallet_balance NUMERIC(10,2) NOT NULL DEFAULT 0;`);
  await pool.query(`ALTER TABLE players ADD COLUMN IF NOT EXISTS bonus_balance NUMERIC(10,2) NOT NULL DEFAULT 0;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      type TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      note TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`ALTER TABLE wallet_transactions ADD COLUMN IF NOT EXISTS balance_type TEXT NOT NULL DEFAULT 'wallet';`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS withdrawal_requests (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      amount NUMERIC(10,2) NOT NULL,
      upi_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id SERIAL PRIMARY KEY,
      player_id TEXT NOT NULL,
      endpoint TEXT NOT NULL UNIQUE,
      p256dh TEXT NOT NULL,
      auth TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sent_notifications (
      match_id TEXT PRIMARY KEY,
      sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
  console.log('Connected to Postgres — registrations, player accounts, push subscriptions, and site content will persist in the database.');
}

module.exports = { pool, initDb };
