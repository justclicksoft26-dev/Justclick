import nodemailer from 'nodemailer';
import { otpEmail } from './emailTemplate.js';

// Credentials: SMTP_USER/SMTP_PASS, falling back to EMAIL_USER/EMAIL_PASS
const user = () => process.env.SMTP_USER || process.env.EMAIL_USER;
const pass = () => process.env.SMTP_PASS || process.env.EMAIL_PASS;

let transporter = null;
export function getTransporter() {
  if (!user() || !pass()) return null;
  if (!transporter) {
    if (process.env.SMTP_HOST) {
      // e.g. Microsoft 365: smtp.office365.com : 587 (STARTTLS)
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: process.env.SMTP_SECURE === 'true',
        requireTLS: process.env.SMTP_SECURE !== 'true',
        auth: { user: user(), pass: pass() },
        tls: { minVersion: 'TLSv1.2' },
      });
    } else {
      transporter = nodemailer.createTransport({ service: 'gmail', auth: { user: user(), pass: pass() } });
    }
  }
  return transporter;
}

export async function sendOtp(email, code) {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[DEV] mail credentials not set - OTP for ${email}: ${code}\n`);
    return;
  }
  const { subject, text, html } = otpEmail({ code, minutes: 5 });
  // Errors are thrown on purpose so the API can tell the user the email was not sent.
  // "From" must be the authenticated mailbox, otherwise Microsoft 365 rejects it (SendAsDenied).
  await t.sendMail({
    from: `"Horizon Attendance" <${user()}>`,
    to: email,
    subject,
    text,
    html,
  });
}
