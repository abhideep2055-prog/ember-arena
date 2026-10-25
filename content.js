const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJsonFile(file, fallback) {
  const p = path.join(DATA_DIR, file);
  if (!fs.existsSync(p)) {
    fs.writeFileSync(p, JSON.stringify(fallback, null, 2));
    return fallback;
  }
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8'));
  } catch (e) {
    return fallback;
  }
}

function writeJsonFile(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

// In-memory cache of site content (schedule, leaderboard, news, ...).
// Why: every page view used to fire ~8 database queries, and the notification
// scheduler fired one every minute. That kept the free Postgres awake around the
// clock and burned through its monthly quota. Now reads are served from memory
// for a short time, writes update the cache immediately, and if the database is
// down we keep serving the last known copy instead of an error.
const cache = new Map(); // key -> { value, at }
const DEFAULT_MAX_AGE_MS = 30 * 1000;
const clone = (v) => JSON.parse(JSON.stringify(v));

async function getContent(key, fallback, maxAgeMs = DEFAULT_MAX_AGE_MS) {
  if (!pool) return readJsonFile(`${key}.json`, fallback);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return clone(hit.value);

  try {
    const res = await pool.query(`SELECT value FROM site_content WHERE key = $1`, [key]);
    let value;
    if (res.rowCount === 0) {
      await pool.query(
        `INSERT INTO site_content (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(fallback)]
      );
      value = fallback;
    } else {
      value = res.rows[0].value;
    }
    cache.set(key, { value: clone(value), at: Date.now() });
    return clone(value);
  } catch (e) {
    if (hit) {
      console.error(`DB read failed for "${key}", serving last known copy:`, e.message);
      return clone(hit.value);
    }
    throw e;
  }
}

async function setContent(key, value) {
  if (!pool) {
    writeJsonFile(`${key}.json`, value);
    return;
  }
  await pool.query(
    `INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
  cache.set(key, { value: clone(value), at: Date.now() });
}

module.exports = { getContent, setContent };
