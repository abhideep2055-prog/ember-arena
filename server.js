require('dotenv').config();
const express = require('express');
const cors = require('cors');
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
const mailer = require('./mailer');
const walletStore = require('./wallet');
const pushStore = require('./push');
const contentStore = require('./content');

let webpush;
try { webpush = require('web-push'); } catch (e) { webpush = null; }

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const pushEnabled = !!(webpush && VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (pushEnabled) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
} else {
  console.warn('⚠️  Push notifications are not configured — set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env to enable match alerts.');
}

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

async function requireAuth(req, res, next) {
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
  try {
    const blocked = await playerStore.isBlocked(decoded.sub);
    if (blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support for help.' });
    }
  } catch (e) {
    // If the blocked-status check itself fails (e.g. no DB), don't lock everyone out —
    // fail open here since login already gates blocked accounts on the happy path.
  }
  req.player = decoded;
  next();
}

const app = express();
// Render (and most hosts) sit behind a reverse proxy. Without this,
// express-rate-limit can't safely read the real client IP from
// X-Forwarded-For and throws, which was breaking API requests.
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const rateLimit = require('express-rate-limit');

// General safety net: caps how many requests any single IP can make per
// minute across the whole API, so one runaway script/bot can't overload
// the free-tier server for everyone else.
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Please slow down and try again in a moment.' },
});
app.use('/api/', generalLimiter);

// Tighter limit on auth endpoints specifically — these are the ones worth
// protecting from brute-force/spam (login guessing, mass signups).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please try again in a few minutes.' },
});
app.use('/api/auth/', authLimiter);

const BASE_PLAYER_COUNT = 18420;
const BASE_PRIZE_POOL = 1250000;

// ---- Public API ----

app.get('/api/stats', async (req, res) => {
  const total = await regStore.countRegistrations();
  const schedule = await contentStore.getContent('schedule', []);
  let totalUsers = 0;
  try {
    totalUsers = await playerStore.countPlayers();
  } catch (e) {
    if (e.message !== 'NO_DB') console.error('countPlayers error:', e);
  }
  res.json({
    playersRegistered: BASE_PLAYER_COUNT + total,
    totalUsers,
    prizePool: BASE_PRIZE_POOL,
    matchesToday: schedule.filter(m => m.day === 'TODAY' && m.approvalStatus !== 'pending').length,
  });
});

app.get('/api/leaderboard', async (req, res) => {
  res.json(await contentStore.getContent('leaderboard', []));
});
app.get('/api/schedule', async (req, res) => {
  const schedule = await contentStore.getContent('schedule', []);
  res.json(schedule.filter(m => m.approvalStatus !== 'pending'));
});
app.get('/api/news', async (req, res) => {
  res.json(await contentStore.getContent('news', []));
});

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
    try {
      await walletStore.adjustBonus(player.id, 10, 'bonus', 'Welcome bonus');
    } catch (bonusErr) {
      console.error('Welcome bonus credit failed:', bonusErr.message);
    }
    const token = signToken(player);
    res.json({ token, player: { id: player.id, ign: player.ign, email: player.email, phone: player.phone } });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected. Set DATABASE_URL in backend/.env (see README).' });
    }
    if (e.code === '23505') {
      return res.status(409).json({ error: 'An account with this email already exists. Try logging in instead.' });
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
    if (player.blocked) {
      return res.status(403).json({ error: 'Your account has been blocked. Contact support for help.' });
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

// ---- Password reset (email OTP) ----

const GENERIC_RESET_MSG = 'If an account exists with that email, a code has been sent to it.';

app.post('/api/auth/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  if (!mailer.mailEnabled) {
    return res.status(503).json({ error: 'Email is not configured on this server yet. Contact the team directly to reset your password.' });
  }
  try {
    const player = await playerStore.findByEmail(String(email).trim());
    if (player) {
      const otp = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await playerStore.createPasswordReset(player.email, otp, expiresAt);
      try {
        await mailer.sendOtpEmail(player.email, otp);
      } catch (mailErr) {
        console.error('OTP email send failed:', mailErr.message);
        return res.status(500).json({ error: 'Could not send the reset email. Try again in a moment.' });
      }
    }
    // Same message whether or not the account exists, so no one can probe for registered emails.
    res.json({ success: true, message: GENERIC_RESET_MSG });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected.' });
    }
    console.error('Forgot-password error:', e);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

app.post('/api/auth/reset-password', async (req, res) => {
  const { email, otp, newPassword } = req.body || {};
  if (!email || !otp || !newPassword) {
    return res.status(400).json({ error: 'Email, code, and new password are required.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  try {
    const validReset = await playerStore.findValidReset(String(email).trim(), String(otp).trim());
    if (!validReset) {
      return res.status(400).json({ error: 'That code is invalid or has expired. Request a new one.' });
    }
    const passwordHash = await bcrypt.hash(String(newPassword), 10);
    await playerStore.updatePassword(String(email).trim(), passwordHash);
    await playerStore.deleteResetsForEmail(String(email).trim());
    res.json({ success: true });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected.' });
    }
    console.error('Reset-password error:', e);
    res.status(500).json({ error: 'Could not reset your password. Please try again.' });
  }
});

// ---- Wallet (players) ----

const MIN_WITHDRAWAL = 50;

app.get('/api/wallet', requireAuth, async (req, res) => {
  try {
    const wallet = await walletStore.getWallet(req.player.sub);
    const transactions = await walletStore.getTransactions(req.player.sub);
    res.json({ balance: wallet.balance, bonusBalance: wallet.bonusBalance, transactions, minWithdrawal: MIN_WITHDRAWAL });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Wallet needs a database connected. Set DATABASE_URL in backend/.env.' });
    }
    console.error('Wallet fetch error:', e);
    res.status(500).json({ error: 'Could not load your wallet.' });
  }
});

app.post('/api/wallet/withdraw', requireAuth, async (req, res) => {
  const { amount, upiId } = req.body || {};
  const amt = Number(amount);
  if (!amt || amt < MIN_WITHDRAWAL) {
    return res.status(400).json({ error: `Minimum withdrawal is ₹${MIN_WITHDRAWAL}.` });
  }
  if (!upiId || String(upiId).trim().length < 3) {
    return res.status(400).json({ error: 'Enter a valid UPI ID.' });
  }
  try {
    const id = await walletStore.createWithdrawalRequest(req.player.sub, amt, String(upiId).trim());
    res.json({ success: true, requestId: id });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Wallet needs a database connected. Set DATABASE_URL in backend/.env.' });
    }
    if (e.code === 'INSUFFICIENT_FUNDS') {
      return res.status(400).json({ error: 'Insufficient wallet balance.' });
    }
    console.error('Withdrawal request error:', e);
    res.status(500).json({ error: 'Could not submit withdrawal request.' });
  }
});

// ---- Push notifications ----

app.get('/api/push/vapid-public-key', (req, res) => {
  if (!pushEnabled) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

app.post('/api/push/subscribe', requireAuth, async (req, res) => {
  if (!pushEnabled) {
    return res.status(503).json({ error: 'Push notifications are not configured on this server.' });
  }
  const subscription = req.body || {};
  if (!subscription.endpoint || !subscription.keys) {
    return res.status(400).json({ error: 'Invalid subscription.' });
  }
  try {
    await pushStore.saveSubscription(req.player.sub, subscription);
    res.json({ success: true });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Push notifications need a database connected. Set DATABASE_URL in backend/.env.' });
    }
    console.error('Push subscribe error:', e);
    res.status(500).json({ error: 'Could not save your notification subscription.' });
  }
});

app.post('/api/push/unsubscribe', requireAuth, async (req, res) => {
  const { endpoint } = req.body || {};
  if (endpoint) await pushStore.removeSubscription(endpoint);
  res.json({ success: true });
});

// ---- Registration (requires a logged-in player) ----

app.post('/api/register', requireAuth, async (req, res) => {
  const { uid, mode, matchId, paymentId, payerUpiId } = req.body || {};
  if (!uid) {
    return res.status(400).json({ error: 'Free Fire UID is required.' });
  }
  const { sub: playerId, ign, email, phone } = req.player;
  try {
    const isDuplicate = await regStore.findDuplicate(uid, matchId);
    if (isDuplicate) {
      return res.status(409).json({ error: 'This Free Fire UID is already registered for this match.' });
    }
    const match = matchId ? (await contentStore.getContent('schedule', [])).find(m => m.id === matchId) : null;
    const entryFee = match ? Number(match.entryFee) || 0 : 0;

    let bonusApplied = 0;
    let paymentStatus = 'none';
    if (entryFee > 0) {
      try {
        const wallet = await walletStore.getWallet(playerId);
        if (wallet) bonusApplied = Math.min(wallet.bonusBalance, entryFee);
      } catch (e) {
        if (e.message !== 'NO_DB') console.error('Bonus lookup error:', e);
      }
      const remaining = Math.round((entryFee - bonusApplied) * 100) / 100;
      if (remaining > 0) {
        // Manual UPI flow: needs the player's own UPI ID as proof of payment,
        // or a Razorpay paymentId if that's configured instead.
        if (!payerUpiId && !paymentId) {
          return res.status(402).json({ error: 'Payment is required before registration.' });
        }
        paymentStatus = paymentId ? 'confirmed' : 'pending';
      } else {
        paymentStatus = 'confirmed'; // fully covered by bonus, nothing to verify
      }
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
      paymentStatus,
      payerUpiId: payerUpiId ? String(payerUpiId).trim().slice(0, 60) : null,
      createdAt: new Date().toISOString(),
    };
    await regStore.addRegistration(entry);

    if (bonusApplied > 0) {
      try {
        await walletStore.adjustBonus(playerId, -bonusApplied, 'entry_fee', `Entry fee for ${match.name}`);
      } catch (e) {
        console.error('Bonus deduction failed after registration:', e.message);
      }
    }

    const total = await regStore.countRegistrations();
    res.json({ success: true, entry, bonusApplied, totalPlayers: BASE_PLAYER_COUNT + total });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: 'Something went wrong saving your registration. Please try again.' });
  }
});

// ---- Player-hosted tournaments ----

const HOST_FEE = 50;
const HOST_REWARD = 100;

app.post('/api/tournaments/host-fee-quote', requireAuth, async (req, res) => {
  let bonusApplied = 0;
  try {
    const wallet = await walletStore.getWallet(req.player.sub);
    if (wallet) bonusApplied = Math.min(wallet.bonusBalance, HOST_FEE);
  } catch (e) {
    if (e.message !== 'NO_DB') console.error('Bonus lookup error:', e);
  }
  const remaining = Math.round((HOST_FEE - bonusApplied) * 100) / 100;
  res.json({ hostFee: HOST_FEE, bonusApplied, remaining });
});

app.post('/api/tournaments/create', requireAuth, async (req, res) => {
  const { name, mode, day, time, startAt, map, sub, prizeAmount, payerUpiId } = req.body || {};
  if (!name || !mode || !day || !time || !startAt) {
    return res.status(400).json({ error: 'Name, mode, day, time, and start date/time are required.' });
  }
  try {
    let bonusApplied = 0;
    const wallet = await walletStore.getWallet(req.player.sub);
    if (wallet) bonusApplied = Math.min(wallet.bonusBalance, HOST_FEE);
    const remaining = Math.round((HOST_FEE - bonusApplied) * 100) / 100;

    if (remaining > 0 && !payerUpiId) {
      return res.status(402).json({ error: 'Hosting fee payment is required.' });
    }

    const match = {
      id: 'h' + Date.now(),
      day: String(day).toUpperCase(),
      time: String(time),
      startAt,
      name: String(name).slice(0, 60),
      sub: sub ? String(sub).slice(0, 60) : `${mode} · Hosted by ${req.player.ign}`,
      map: map ? String(map).slice(0, 40) : '',
      entryFee: 0,
      status: 'open',
      hostedBy: req.player.sub,
      hostIgn: req.player.ign,
      hostEmail: req.player.email,
      prizeAmount: Number(prizeAmount) || 0,
      approvalStatus: 'pending',
      hostFeeBonusApplied: bonusApplied,
      hostFeeStatus: remaining > 0 ? 'pending' : 'confirmed',
      payerUpiId: payerUpiId ? String(payerUpiId).trim().slice(0, 60) : null,
      rewardPaid: false,
      createdAt: new Date().toISOString(),
    };

    const schedule = await contentStore.getContent('schedule', []);
    schedule.push(match);
    await contentStore.setContent('schedule', schedule);

    if (bonusApplied > 0) {
      try {
        await walletStore.adjustBonus(req.player.sub, -bonusApplied, 'hosting_fee', `Hosting fee for ${match.name}`);
      } catch (e) {
        console.error('Bonus deduction failed for hosted tournament:', e.message);
      }
    }

    res.json({ success: true, match, bonusApplied });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Hosting a tournament needs a database connected.' });
    }
    console.error('Host tournament creation error:', e);
    res.status(500).json({ error: 'Could not create your tournament. Please try again.' });
  }
});

app.get('/api/admin/hosted-tournaments', async (req, res) => {
  const schedule = await contentStore.getContent('schedule', []);
  res.json(schedule.filter(m => m.hostedBy));
});

app.post('/api/admin/hosted-tournaments/:id/approve', async (req, res) => {
  const schedule = await contentStore.getContent('schedule', []);
  const match = schedule.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Tournament not found.' });
  match.approvalStatus = 'approved';
  match.hostFeeStatus = 'confirmed';
  await contentStore.setContent('schedule', schedule);
  res.json({ success: true });
});

app.post('/api/admin/hosted-tournaments/:id/reject', async (req, res) => {
  const schedule = await contentStore.getContent('schedule', []);
  const idx = schedule.findIndex(m => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Tournament not found.' });
  const match = schedule[idx];
  schedule.splice(idx, 1);
  await contentStore.setContent('schedule', schedule);
  if (match.hostFeeBonusApplied > 0) {
    try {
      await walletStore.adjustBonus(match.hostedBy, match.hostFeeBonusApplied, 'hosting_fee_refund', `Refund — tournament "${match.name}" rejected`);
    } catch (e) {
      console.error('Bonus refund failed:', e.message);
    }
  }
  res.json({ success: true });
});

app.post('/api/admin/hosted-tournaments/:id/pay-reward', async (req, res) => {
  const schedule = await contentStore.getContent('schedule', []);
  const match = schedule.find(m => m.id === req.params.id);
  if (!match) return res.status(404).json({ error: 'Tournament not found.' });
  if (match.approvalStatus !== 'approved') return res.status(400).json({ error: 'Approve the tournament before paying the organizer reward.' });
  if (match.rewardPaid) return res.status(400).json({ error: 'Reward already paid for this tournament.' });
  try {
    await walletStore.adjustWallet(match.hostedBy, HOST_REWARD, 'host_reward', `Organizer reward for "${match.name}"`);
    match.rewardPaid = true;
    await contentStore.setContent('schedule', schedule);
    res.json({ success: true });
  } catch (e) {
    console.error('Host reward payment error:', e);
    res.status(500).json({ error: 'Could not pay the organizer reward.' });
  }
});

// ---- Payments (Razorpay) ----

app.post('/api/payment/create-order', requireAuth, async (req, res) => {
  const { matchId } = req.body || {};
  if (!matchId) {
    return res.status(400).json({ error: 'matchId is required.' });
  }
  const schedule = await contentStore.getContent('schedule', []);
  const match = schedule.find(m => m.id === matchId);
  if (!match) {
    return res.status(404).json({ error: 'Tournament not found.' });
  }
  const entryFee = Number(match.entryFee) || 0;
  if (entryFee <= 0) {
    return res.status(400).json({ error: 'This tournament is free — no payment needed.' });
  }

  let bonusApplied = 0;
  try {
    const wallet = await walletStore.getWallet(req.player.sub);
    if (wallet) bonusApplied = Math.min(wallet.bonusBalance, entryFee);
  } catch (e) {
    if (e.message !== 'NO_DB') console.error('Bonus lookup error:', e);
  }
  const remaining = Math.round((entryFee - bonusApplied) * 100) / 100;

  if (remaining <= 0) {
    return res.json({ fullyCovered: true, bonusApplied: entryFee });
  }

  // Not configured with Razorpay? That's fine — the frontend falls back to
  // showing the admin's UPI ID / QR code for manual payment instead.
  if (!razorpay) {
    return res.json({ fullyCovered: false, razorpayAvailable: false, bonusApplied, remaining });
  }
  try {
    const order = await razorpay.orders.create({
      amount: Math.round(remaining * 100), // paise
      currency: 'INR',
      receipt: `receipt_${matchId}_${Date.now()}`,
    });
    res.json({
      fullyCovered: false,
      razorpayAvailable: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      bonusApplied,
      remaining,
    });
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

app.post('/api/admin/registrations/:id/confirm-payment', async (req, res) => {
  try {
    await regStore.confirmPayment(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Wallet (admin) ----

app.get('/api/admin/withdrawals', async (req, res) => {
  try {
    res.json(await walletStore.listWithdrawals());
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Wallet needs a database connected.' });
    }
    res.status(500).json({ error: 'Could not load withdrawal requests.' });
  }
});

app.post('/api/admin/withdrawals/:id/pay', async (req, res) => {
  try {
    await walletStore.markWithdrawalPaid(Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/withdrawals/:id/reject', async (req, res) => {
  try {
    await walletStore.rejectWithdrawal(Number(req.params.id));
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/wallet/credit', async (req, res) => {
  const { email, amount, note } = req.body || {};
  const amt = Number(amount);
  if (!email || !amt) {
    return res.status(400).json({ error: 'Email and amount are required.' });
  }
  try {
    const player = await walletStore.findPlayerByEmailOrUid(String(email).trim());
    if (!player) return res.status(404).json({ error: 'No player found with that email.' });
    const newBalance = await walletStore.adjustWallet(player.id, amt, amt > 0 ? 'win' : 'adjustment', note || null);
    res.json({ success: true, player: { ign: player.ign, email: player.email }, newBalance });
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Wallet needs a database connected.' });
    }
    console.error('Wallet credit error:', e);
    res.status(500).json({ error: 'Could not credit wallet.' });
  }
});

app.get('/api/admin/players', async (req, res) => {
  try {
    res.json(await walletStore.listPlayersWithUids());
  } catch (e) {
    if (e.message === 'NO_DB') {
      return res.status(503).json({ error: 'Player accounts need a database connected.' });
    }
    console.error('Players list error:', e);
    res.status(500).json({ error: 'Could not load players.' });
  }
});

app.post('/api/admin/players/block', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    await playerStore.setBlocked(String(email).trim(), true);
    res.json({ success: true });
  } catch (e) {
    if (e.message === 'NO_DB') return res.status(503).json({ error: 'Player accounts need a database connected.' });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/players/unblock', async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    await playerStore.setBlocked(String(email).trim(), false);
    res.json({ success: true });
  } catch (e) {
    if (e.message === 'NO_DB') return res.status(503).json({ error: 'Player accounts need a database connected.' });
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/leaderboard', async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of squads.' });
  await contentStore.setContent('leaderboard', req.body);
  res.json({ success: true });
});

app.post('/api/admin/schedule', async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of matches.' });
  await contentStore.setContent('schedule', req.body);
  res.json({ success: true });
});

app.post('/api/admin/news', async (req, res) => {
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Expected an array of news items.' });
  await contentStore.setContent('news', req.body);
  res.json({ success: true });
});

// ---- Prize pool ----

const PRIZE_POOL_DEFAULT = {
  first: 0, second: 0, third: 0,
  total: 0, totalLabel: 'Total prize pool distributed this month',
};

app.get('/api/prize-pool', async (req, res) => {
  res.json(await contentStore.getContent('prizePool', PRIZE_POOL_DEFAULT));
});

app.post('/api/admin/prize-pool', async (req, res) => {
  const body = req.body || {};
  const clean = {
    first: Number(body.first) || 0,
    second: Number(body.second) || 0,
    third: Number(body.third) || 0,
    total: Number(body.total) || 0,
    totalLabel: body.totalLabel ? String(body.totalLabel).slice(0, 120) : PRIZE_POOL_DEFAULT.totalLabel,
  };
  await contentStore.setContent('prizePool', clean);
  res.json({ success: true });
});

// ---- Maintenance mode ----

app.get('/api/maintenance', async (req, res) => {
  res.json(await contentStore.getContent('maintenance', { enabled: false, message: '' }));
});

app.post('/api/admin/maintenance', async (req, res) => {
  const { enabled, message } = req.body || {};
  await contentStore.setContent('maintenance', {
    enabled: !!enabled,
    message: message ? String(message).slice(0, 300) : '',
  });
  res.json({ success: true });
});

// ---- Social links ----

const SOCIAL_DEFAULT = { instagram: '', youtube: '', discord: '', whatsapp: '', telegram: '' };

app.get('/api/social-links', async (req, res) => {
  res.json(await contentStore.getContent('socialLinks', SOCIAL_DEFAULT));
});

app.post('/api/admin/social-links', async (req, res) => {
  const body = req.body || {};
  const clean = {};
  for (const key of Object.keys(SOCIAL_DEFAULT)) {
    clean[key] = body[key] ? String(body[key]).slice(0, 300) : '';
  }
  await contentStore.setContent('socialLinks', clean);
  res.json({ success: true });
});

// ---- Support phone (call button) ----

app.get('/api/support-phone', async (req, res) => {
  res.json(await contentStore.getContent('supportPhone', { phone: '' }));
});

app.post('/api/admin/support-phone', async (req, res) => {
  const { phone } = req.body || {};
  await contentStore.setContent('supportPhone', { phone: phone ? String(phone).trim().slice(0, 20) : '' });
  res.json({ success: true });
});

// ---- Manual UPI payment settings ----

const PAYMENT_SETTINGS_DEFAULT = { upiId: '', payeeName: 'Ember Arena' };

app.get('/api/payment-settings', async (req, res) => {
  res.json(await contentStore.getContent('paymentSettings', PAYMENT_SETTINGS_DEFAULT));
});

app.post('/api/admin/payment-settings', async (req, res) => {
  const body = req.body || {};
  const clean = {
    upiId: body.upiId ? String(body.upiId).trim().slice(0, 100) : '',
    payeeName: body.payeeName ? String(body.payeeName).trim().slice(0, 60) : PAYMENT_SETTINGS_DEFAULT.payeeName,
  };
  await contentStore.setContent('paymentSettings', clean);
  res.json({ success: true });
});

// ---- Match-start notifications ----
// Runs every minute. For any match with a real start time (set by the admin)
// that is 9-10 minutes away and hasn't been notified yet, this pushes a
// browser notification to everyone registered for it.
// Note: on Render's free tier the service sleeps when idle, so this only
// fires while the app happens to be awake (e.g. someone has the site open).

async function checkUpcomingMatchesAndNotify() {
  if (!pushEnabled) return;
  const now = Date.now();
  const schedule = await contentStore.getContent('schedule', []);
  for (const match of schedule) {
    if (!match.startAt) continue;
    const startTime = new Date(match.startAt).getTime();
    if (isNaN(startTime)) continue;
    const minutesUntil = (startTime - now) / 60000;
    if (minutesUntil > 9 && minutesUntil <= 10) {
      try {
        const already = await pushStore.wasNotified(match.id);
        if (already) continue;
        const playerIds = await regStore.playerIdsForMatch(match.id);
        if (playerIds.length === 0) {
          await pushStore.markNotified(match.id);
          continue;
        }
        const subs = await pushStore.getSubscriptionsForPlayers(playerIds);
        const payload = JSON.stringify({
          title: 'Match starting soon!',
          body: `${match.name} starts in 10 minutes. Room ID is coming by SMS.`,
          url: '/index.html#schedule',
        });
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
              payload
            );
          } catch (err) {
            if (err.statusCode === 404 || err.statusCode === 410) {
              await pushStore.removeSubscription(sub.endpoint);
            } else {
              console.error('Push send error:', err.message);
            }
          }
        }
        await pushStore.markNotified(match.id);
      } catch (e) {
        console.error('Notification check error for match', match.id, e.message);
      }
    }
  }
}

if (pushEnabled) {
  setInterval(checkUpcomingMatchesAndNotify, 60 * 1000);
}

const PORT = process.env.PORT || 3000;

initDb()
  .catch(e => console.error('Database init failed, falling back to JSON file storage:', e.message))
  .finally(() => {
    app.listen(PORT, () => {
      console.log(`Ember Arena server running at http://localhost:${PORT}`);
    });
  });
