require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

let Razorpay;
try { Razorpay = require('razorpay'); } catch (e) { Razorpay = null; }

const razorpay = (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET)
  ? new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET })
  : null;

const { initDb } = require('./db');
const regStore = require('./registrations');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const playerStore = require('./players');

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET is not set — using an insecure default. Set JWT_SECRET in .env before going live.');
}

function signToken(player) {
  return jwt.sign(
    { sub: player.id, ign: player.ign, email: player.email, phone: player.phone || null },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    req.player = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR);

function readJSON(file, fallback) {
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

function writeJSON(file, data) {
  fs.writeFileSync(path.join(DATA_DIR, file), JSON.stringify(data, null, 2));
}

const DEFAULT_LEADERBOARD = [
  { squad: "TridentFF", tag: "TFF", matches: 24, booyahs: 9, kills: 212, pts: 1840 },
  { squad: "NoMercySquad", tag: "NMS", matches: 22, booyahs: 7, kills: 198, pts: 1705 },
  { squad: "Alpha7", tag: "A7", matches: 25, booyahs: 6, kills: 220, pts: 1690 },
  { squad: "IceKingFF", tag: "ICE", matches: 20, booyahs: 6, kills: 175, pts: 1520 },
  { squad: "VenomRiders", tag: "VR", matches: 21, booyahs: 5, kills: 180, pts: 1465 },
  { squad: "GhostProtocol", tag: "GP", matches: 19, booyahs: 4, kills: 160, pts: 1310 },
  { squad: "Blitzkrieg", tag: "BLZ", matches: 18, booyahs: 4, kills: 150, pts: 1260 },
  { squad: "Nightfall", tag: "NF", matches: 17, booyahs: 3, kills: 140, pts: 1105 },
];

const DEFAULT_SCHEDULE = [
  { id: "m1", day: "TODAY", time: "18:00", name: "Bermuda Squad Clash", sub: "Squad · 48 slots", map: "Bermuda", entryFee: 0, status: "live" },
  { id: "m2", day: "TODAY", time: "20:30", name: "Purgatory Duo Showdown", sub: "Duo · 24 slots", map: "Purgatory", entryFee: 20, status: "open" },
  { id: "m3", day: "TOMORROW", time: "17:00", name: "Bermuda Solo Sprint", sub: "Solo · 50 slots", map: "Bermuda", entryFee: 0, status: "open" },
  { id: "m4", day: "TOMORROW", time: "21:00", name: "Kalahari Squad Finals", sub: "Squad · 12 slots", map: "Kalahari", entryFee: 50, status: "soon" },
  { id: "m5", day: "SAT", time: "19:00", name: "Weekend Grand Booyah", sub: "Squad · 48 slots", map: "Bermuda", entryFee: 100, status: "soon" },
];

const DEFAULT_NEWS = [
  { date: "12 JUL 2026", cat: "Update", title: "Season 4 leaderboard reset", body: "Points reset for all squads. New season runs through August with a bigger prize pool." },
  { date: "09 JUL 2026", cat: "Announcement", title: "Weekend Grand Booyah added", body: "A new weekly squad tournament with a ₹87,500 combined payout for the top 3." },
  { date: "03 JUL 2026", cat: "Fair play", title: "Emulator detection upgraded", body: "Stricter checks are now live across all ranked matches to keep the leaderboard fair." },
];

const BASE_PLAYER_COUNT = 18420;
const BASE_PRIZE_POOL = 1250000;

let leaderboard = readJSON('leaderboard.json', DEFAULT_LEADERBOARD);
let schedule = readJSON('schedule.json', DEFAULT_SCHEDULE);
let news = readJSON('news.json', DEFAULT_NEWS);

// ---- Public API ----

app.get('/api/stats', async (req, res) => {
  const total = await regStore.countRegistrations();
  res.json({
    playersRegistered: BASE_PLAYER_COUNT + total,
    prizePool: BASE_PRIZE_POOL,
    matchesToday: schedule.filter(m => m.day === 'TODAY').length,
  });
});

app.get('/api/leaderboard', (req, res) => res.json(leaderboard));
app.get('/api/schedule', (req, res) => res.json(schedule));
app.get('/api/news', (req, res) => res.json(news));

// ---- Player accounts (signup / login) ----

app.post('/api/auth/signup', async (req, res) => {
  const { ign, email, phone, password } = req.body || {};
  if (!ign || !email || !phone || !password) {
    return res.status(400).json({ error: 'Name, email, phone, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  try {
    const existing = await playerStore.findByEmail(email);
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
    }
    const passwordHash = await bcrypt.hash(String(password), 10);
    const player = {
      id: Date.now().toString(),
      ign: String(ign).slice(0, 40),
      email: String(email).slice(0, 80),
      phone: String(phone).slice(0, 20),
      passwordHash,
    };
    await playerStore.createPlayer(player);
    const token = signToken(player);
    res.json({ token, player: { id: player.id, ign: player.ign, email: player.email, phone: player.phone } });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected. Set DATABASE_URL in backend/.env (see README).' });
    }
    console.error('Signup error:', e);
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const player = await playerStore.findByEmail(email);
    if (!player) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    const ok = await bcrypt.compare(String(password), player.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Wrong email or password.' });
    }
    const token = signToken({ id: player.id, ign: player.ign, email: player.email, phone: player.phone });
    res.json({ token, player: { id: player.id, ign: player.ign, email: player.email, phone: player.phone } });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected. Set DATABASE_URL in backend/.env (see README).' });
    }
    console.error('Login error:', e);
    res.status(500).json({ error: 'Could not log in. Please try again.' });
  }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ player: { id: req.player.sub, ign: req.player.ign, email: req.player.email, phone: req.player.phone } });
});

// ---- Registration (requires a logged-in player) ----

app.post('/api/register', requireAuth, async (req, res) => {
  const { uid, mode, matchId, paymentId } = req.body || {};
  if (!uid) {
    return res.status(400).json({ error: 'Free Fire UID is required.' });
  }
  const { sub: playerId, ign, email, phone } = req.player;
  try {
    const isDuplicate = await regStore.findDuplicate(uid, matchId);
    if (isDuplicate) {
      return res.status(409).json({ error: 'This Free Fire UID is already registered for this match.' });
    }
    const match = matchId ? schedule.find(m => m.id === matchId) : null;
    if (match && match.entryFee > 0 && !paymentId) {
      return res.status(402).json({ error: 'This match requires payment before registration.' });
    }
    const entry = {
      id: Date.now().toString(),
      playerId,
      ign,
      uid: String(uid).slice(0, 20),
      mode: mode || 'Solo',
      email,
      phone: phone || '',
      matchId: matchId || null,
      paymentId: paymentId || null,
      createdAt: new Date().toISOString(),
    };
    await regStore.addRegistration(entry);
    const total = await regStore.countRegistrations();
    res.json({ success: true, entry, totalPlayers: BASE_PLAYER_COUNT + total });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: 'Something went wrong saving your registration. Please try again.' });
  }
});

// ---- Payments (Razorpay) ----

app.post('/api/payment/create-order', async (req, res) => {
  if (!razorpay) {
    return res.status(503).json({ error: 'Payment gateway is not configured yet. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET to backend/.env.' });
  }
  const { amount, matchId } = req.body || {};
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: 'Invalid amount.' });
  }
  try {
    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100), // paise
      currency: 'INR',
      receipt: `receipt_${matchId || 'na'}_${Date.now()}`,
    });
    res.json({ orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
  } catch (e) {
    res.status(500).json({ error: 'Could not create payment order.' });
  }
});

app.post('/api/payment/verify', (req, res) => {
  if (!process.env.RAZORPAY_KEY_SECRET) {
    return res.status(503).json({ error: 'Payment gateway is not configured yet.' });
  }
  const { order_id, payment_id, signature } = req.body || {};
  if (!order_id || !payment_id || !signature) {
    return res.status(400).json({ error: 'Missing payment details.' });
  }
  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${order_id}|${payment_id}`)
    .digest('hex');
  const verified = expected === signature;
  res.json({ verified });
});

// ---- Admin endpoints (protected by ADMIN_KEY) ----

function requireAdmin(req, res, next) {
  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_KEY in backend/.env.' });
  }
  const key = req.headers['x-admin-key'];
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Invalid or missing admin key.' });
  }
  next();
}

app.post('/api/admin/login', (req, res) => {
  if (!process.env.ADMIN_KEY) {
    return res.status(503).json({ error: 'Admin access is not configured. Set ADMIN_KEY in backend/.env.' });
  }
  const { key } = req.body || {};
  if (key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Wrong admin key.' });
  }
  res.json({ success: true });
});

app.use('/api/admin', requireAdmin);

app.get('/api/admin/registrations', async (req, res) => {
  const data = await regStore.allRegistrations();
  res.json(data);
});

app.post('/api/admin/leaderboard', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of squads.' });
  leaderboard = req.body;
  writeJSON('leaderboard.json', leaderboard);
  res.json({ success: true });
});

app.post('/api/admin/schedule', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of matches.' });
  schedule = req.body;
  writeJSON('schedule.json', schedule);
  res.json({ success: true });
});

app.post('/api/admin/news', (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of news items.' });
  news = req.body;
  writeJSON('news.json', news);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;

initDb()
  .catch(e => console.error('Database init failed, falling back to JSON file storage:', e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Ember Arena server running at http://localhost:${PORT}`);
    });
  });
