import nodemailer from 'nodemailer';
import { otpEmail } from './emailTemplate.js';

// SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS in the root .env
// (Microsoft 365: smtp.office365.com : 587, SMTP_SECURE=false -> STARTTLS).
// Without SMTP_USER / SMTP_PASS the code is only printed in the server console (dev).
let transporter = null;
function getTransporter() {
  const { SMTP_USER: user, SMTP_PASS: pass } = process.env;
  if (!user || !pass) return null;
  transporter ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user, pass },
    tls: { minVersion: 'TLSv1.2' },
  });
  return transporter;
}

export async function sendOtp(email, code) {
  const t = getTransporter();
  if (!t) {
    console.log(`[checkin] SMTP not set - OTP for ${email}: ${code}`);
    return;
  }
  const { subject, text, html } = otpEmail({ code, minutes: 5 });
  // thrown on purpose so the API can say the email was not sent.
  // "From" must be the authenticated mailbox, otherwise Microsoft 365 rejects it (SendAsDenied).
  await t.sendMail({ from: `"Horizon Attendance" <${process.env.SMTP_USER}>`, to: email, subject, text, html });
}
