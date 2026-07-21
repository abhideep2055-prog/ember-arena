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

// Reads a piece of site content (schedule / leaderboard / news) by key.
// With Postgres connected, this is stored permanently and survives redeploys.
// Without it, falls back to a local JSON file — fine for local dev, but note
// that file resets on most hosting platforms' redeploys (this is exactly the
// bug that made demo tournaments/leaderboard keep reappearing).
async function getContent(key, fallback) {
  if (pool) {
    const res = await pool.query(`SELECT value FROM site_content WHERE key = $1`, [key]);
    if (res.rowCount === 0) {
      await pool.query(
        `INSERT INTO site_content (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
        [key, JSON.stringify(fallback)]
      );
      return fallback;
    }
    return res.rows[0].value;
  } else {
    return readJsonFile(`${key}.json`, fallback);
  }
}

async function setContent(key, value) {
  if (pool) {
    await pool.query(
      `INSERT INTO site_content (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)]
    );
  } else {
    writeJsonFile(`${key}.json`, value);
  }
}

module.exports = { getContent, setContent };
