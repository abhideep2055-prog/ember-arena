# Ember Arena — Free Fire Tournament Website

A full tournament website: dark ember-themed frontend + a real backend that stores
registrations, a password-protected admin dashboard, and Razorpay payments for
paid-entry tournaments.

## What's inside

```
site/
  public/
    index.html        homepage: hero, registration, schedule, leaderboard, prizes, news
    rules.html         rules & fair play page
    admin.html          password-gated dashboard to view registrations
    style.css           shared styles
    app.js               shared JS: nav, live data fetch, form + payment flow
  backend/
    server.js           Express API + serves the frontend + payments + admin auth
    package.json
    .env.example         copy to .env and fill in your own secrets
    data/                 JSON files acting as the database (auto-created)
  render.yaml            one-click config for Render.com
  Procfile                start command for Railway/Heroku-style platforms
```

## Run it locally

You need [Node.js](https://nodejs.org) installed (v18+).

```bash
cd backend
cp .env.example .env     # then open .env and set ADMIN_KEY at minimum
npm install
npm start
```

Open **http://localhost:3000** for the site, and **http://localhost:3000/admin.html**
for the admin dashboard (log in with the `ADMIN_KEY` you set in `.env`).

## Admin dashboard (password protection)

- All `/api/admin/*` routes now require a header `x-admin-key: <your ADMIN_KEY>`.
- Without an `ADMIN_KEY` set in `.env`, the admin routes are disabled entirely (503),
  not silently open — so you can't forget to protect them.
- `admin.html` is a simple login screen that stores the key in the browser's session
  (cleared when the tab closes) and lists all registrations, including which ones paid
  and their payment ID.
- This is one shared key for whoever manages the tournament, not per-user accounts.
  If you need multiple admins with different permissions, that's a bigger auth system —
  let me know if you want that built out.

## Payments (Razorpay)

- Tournaments with an entry fee now trigger a real Razorpay checkout before registration
  is accepted; free tournaments skip straight to registration.
- To turn this on: create a [Razorpay account](https://dashboard.razorpay.com/signup),
  grab your **Key ID** and **Key Secret** from Settings → API Keys, and put them in
  `backend/.env`:
  ```
  RAZORPAY_KEY_ID=rzp_test_xxxxxxxx
  RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxx
  ```
- Start with **test mode keys** (prefixed `rzp_test_`) — Razorpay gives you fake card
  numbers to test the full flow without moving real money. Switch to live keys only once
  you've verified everything end-to-end.
- Going live with real payments requires Razorpay's KYC (PAN, bank account, business
  details) — that part has to be done by you directly on their dashboard, since it's
  your business and bank account, not something I can set up on your behalf.
- Until keys are set, the site still works — free tournaments register normally, and
  paid ones show "payment gateway is not configured yet" instead of failing silently.

## Deploying it publicly

I can't create hosting accounts or click "deploy" for you — that needs your own login on
a hosting platform. But the project is set up to deploy in a few minutes once you have one:

**Render.com (recommended, free tier available)**
1. Push this folder to a GitHub repo.
2. Go to [render.com](https://render.com) → New → Web Service → connect your repo.
   Render will detect `render.yaml` automatically.
3. Add your environment variables (`ADMIN_KEY`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`)
   in the Render dashboard under Environment.
4. Deploy. Render gives you a public URL like `https://ember-arena.onrender.com`.

**Railway.app** works the same way — it reads the `Procfile`, just connect the repo and
add the same environment variables.

**Your own VPS** — install Node, copy the `backend/` and `public/` folders over, set up
`.env`, and run `npm start` behind a process manager like `pm2`, with Nginx in front for
HTTPS.

## Before you scale up

- **Swap JSON files for a real database** if you expect heavy traffic — the JSON storage
  is fine for small/medium tournaments but isn't built for concurrent writes at scale.
  Postgres, MySQL, or MongoDB are natural upgrades; the API shape won't need to change.
- **Rate-limit `/api/register`** to stop spam/bot submissions once the site is public.
- **Move the admin key to a proper login** (username + password, or OAuth) if more than
  one person needs access with different permissions.

## If you don't want to run a server

`public/index.html` still works if opened directly as a file — `app.js` falls back to
built-in sample data for stats, leaderboard, schedule, and news when it can't reach the
API. Registration and payments need the backend running, since there's nowhere else for
that data to go.
