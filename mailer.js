let nodemailer;
try { nodemailer = require('nodemailer'); } catch (e) { nodemailer = null; }

const mailEnabled = !!(nodemailer && process.env.SMTP_EMAIL && process.env.SMTP_APP_PASSWORD);

let transporter = null;
if (mailEnabled) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.SMTP_EMAIL,
      pass: process.env.SMTP_APP_PASSWORD,
    },
  });
} else {
  console.warn('⚠️  Email is not configured — set SMTP_EMAIL and SMTP_APP_PASSWORD in .env to enable password reset emails.');
}

async function sendOtpEmail(toEmail, otp) {
  if (!transporter) throw new Error('MAIL_NOT_CONFIGURED');
  await transporter.sendMail({
    from: `"Ember Arena" <${process.env.SMTP_EMAIL}>`,
    to: toEmail,
    subject: 'Your Ember Arena password reset code',
    text: `Your OTP to reset your Ember Arena password is: ${otp}\n\nThis code expires in 10 minutes. If you didn't request this, you can safely ignore this email.`,
    html: `
      <div style="font-family:sans-serif; max-width:420px;">
        <h2 style="color:#FF6B1A;">Ember Arena</h2>
        <p>Your OTP to reset your password is:</p>
        <p style="font-size:32px; font-weight:bold; letter-spacing:6px;">${otp}</p>
        <p style="color:#666; font-size:13px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
}

module.exports = { mailEnabled, sendOtpEmail };
