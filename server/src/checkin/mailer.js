import nodemailer from 'nodemailer';
import { otpEmail } from './emailTemplate.js';

// Two ways to send (root .env):
// 1) Relay (no per-mailbox 30/min limit): SMTP_RELAY_HOST=<tenant>.mail.protection.outlook.com, port 25, no password.
//    Needs an Exchange connector that trusts this server's IP, and SMTP_FROM (a @horizon.sch.sa address).
// 2) Mailbox login: SMTP_HOST / SMTP_PORT / SMTP_SECURE / SMTP_USER / SMTP_PASS
//    (Microsoft 365: smtp.office365.com : 587, SMTP_SECURE=false -> STARTTLS). From must be SMTP_USER.
// With neither set, the code is only printed in the server console (dev).
let transporter = null;
let from = null;

function getTransporter() {
  if (transporter) return transporter;
  const { SMTP_RELAY_HOST: relay, SMTP_USER: user, SMTP_PASS: pass } = process.env;
  if (relay) {
    from = process.env.SMTP_FROM || user || 'noreply@horizon.sch.sa';
    transporter = nodemailer.createTransport({
      host: relay,
      port: Number(process.env.SMTP_RELAY_PORT || 25),
      secure: false,
      requireTLS: true,
      pool: true,
      maxConnections: 5,
      tls: { minVersion: 'TLSv1.2' },
    });
    return transporter;
  }
  if (!user || !pass) return null;
  from = user;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.office365.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    requireTLS: process.env.SMTP_SECURE !== 'true',
    auth: { user, pass },
    pool: true,
    maxConnections: 3,
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
  await t.sendMail({ from: `"Horizon Attendance" <${from}>`, to: email, subject, text, html });
}
