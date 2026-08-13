// Sends OTP emails via Brevo's HTTPS API instead of raw SMTP.
// Why: most cloud hosts (including Render's free tier) block outbound
// SMTP ports (25/465/587) to fight spam, which makes Gmail SMTP hang or
// fail forever from a hosted server. An HTTPS API call goes over port 443
// like any normal web request, so it isn't blocked.

const mailEnabled = !!(process.env.BREVO_API_KEY && process.env.SMTP_EMAIL);

if (!mailEnabled) {
  console.warn('⚠️  Email is not configured — set BREVO_API_KEY and SMTP_EMAIL in .env to enable password reset emails.');
}

async function sendOtpEmail(toEmail, otp) {
  if (!mailEnabled) throw new Error('MAIL_NOT_CONFIGURED');

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'api-key': process.env.BREVO_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: 'Ember Arena', email: process.env.SMTP_EMAIL },
      to: [{ email: toEmail }],
      subject: 'Your Ember Arena password reset code',
      htmlContent: `
        <div style="font-family:sans-serif; max-width:420px;">
          <h2 style="color:#FF6B1A;">Ember Arena</h2>
          <p>Your OTP to reset your password is:</p>
          <p style="font-size:32px; font-weight:bold; letter-spacing:6px;">${otp}</p>
          <p style="color:#666; font-size:13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Brevo API error (${res.status}): ${errText}`);
  }
}

module.exports = { mailEnabled, sendOtpEmail };
