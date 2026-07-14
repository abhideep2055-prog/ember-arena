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

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

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

let registrations = readJSON('registrations.json', []);
let leaderboard = readJSON('leaderboard.json', DEFAULT_LEADERBOARD);
let schedule = readJSON('schedule.json', DEFAULT_SCHEDULE);
let news = readJSON('news.json', DEFAULT_NEWS);

// ---- Public API ----

app.get('/api/stats', (req, res) => {
  res.json({
    playersRegistered: BASE_PLAYER_COUNT + registrations.length,
    prizePool: BASE_PRIZE_POOL,
    matchesToday: schedule.filter(m => m.day === 'TODAY').length,
  });
});

app.get('/api/leaderboard', (req, res) => res.json(leaderboard));
app.get('/api/schedule', (req, res) => res.json(schedule));
app.get('/api/news', (req, res) => res.json(news));

app.post('/api/register', (req, res) => {
  const { ign, uid, mode, email, phone, matchId, paymentId } = req.body || {};
  if (!ign || !uid || !email || !phone) {
    return res.status(400).json({ error: 'Missing required fields: ign, uid, email, phone.' });
  }
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!emailOk) {
    return res.status(400).json({ error: 'Enter a valid email address.' });
  }
  if (registrations.some(r => r.uid === uid && r.matchId === (matchId || null))) {
    return res.status(409).json({ error: 'This Free Fire UID is already registered for this match.' });
  }
  const match = matchId ? schedule.find(m => m.id === matchId) : null;
  if (match && match.entryFee > 0 && !paymentId) {
    return res.status(402).json({ error: 'This match requires payment before registration.' });
  }
  const entry = {
    id: Date.now().toString(),
    ign: String(ign).slice(0, 40),
    uid: String(uid).slice(0, 20),
    mode: mode || 'Solo',
    email: String(email).slice(0, 80),
    phone: String(phone).slice(0, 20),
    matchId: matchId || null,
    paymentId: paymentId || null,
    createdAt: new Date().toISOString(),
  };
  registrations.push(entry);
  writeJSON('registrations.json', registrations);
  res.json({ success: true, entry, totalPlayers: BASE_PLAYER_COUNT + registrations.length });
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

app.get('/api/admin/registrations', (req, res) => res.json(registrations));

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
app.listen(PORT, () => {
  console.log(`Ember Arena server running at http://localhost:${PORT}`);
});
