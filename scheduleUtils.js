// A tournament is hidden from the public site when EITHER:
//  - 12 hours have passed since its start time, OR
//  - its start was on an earlier calendar day in IST (the midnight sweep).
// Matches without a valid startAt are never auto-hidden (we can't know when they ran).
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

function istDayNumber(ms) {
  return Math.floor((ms + IST_OFFSET_MS) / 86400000);
}

function isExpired(match, nowMs = Date.now()) {
  if (!match || !match.startAt) return false;
  const start = new Date(match.startAt).getTime();
  if (isNaN(start)) return false;
  if (nowMs - start >= TWELVE_HOURS_MS) return true;
  return istDayNumber(start) < istDayNumber(nowMs);
}

module.exports = { isExpired };
