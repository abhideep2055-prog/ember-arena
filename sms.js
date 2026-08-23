// Sends phone OTPs via 2Factor.in's HTTPS API.

const smsEnabled = !!process.env.TWOFACTOR_API_KEY;

if (!smsEnabled) {
  console.warn('⚠️  SMS is not configured — set TWOFACTOR_API_KEY in .env to enable phone verification.');
}

function normalizePhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  return digits.length > 10 ? digits.slice(-10) : digits;
}

async function sendOtpSms(phone, otp) {
  if (!smsEnabled) throw new Error('SMS_NOT_CONFIGURED');
  const tenDigit = normalizePhone(phone);
  if (tenDigit.length !== 10) throw new Error('Invalid phone number.');

  const url = `https://2factor.in/API/V1/${process.env.TWOFACTOR_API_KEY}/SMS/${tenDigit}/${otp}/OTP1`;
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (data.Status !== 'Success') {
    throw new Error(`2Factor SMS error: ${data.Details || res.status}`);
  }
}

module.exports = { smsEnabled, sendOtpSms };
