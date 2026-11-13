import nodemailer from 'nodemailer';
import { otpEmail } from './emailTemplate.js';

let transporter = null;
function getTransporter() {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
    });
  }
  return transporter;
}

export async function sendOtp(email, code) {
  const t = getTransporter();
  if (!t) {
    console.log(`\n[DEV] EMAIL_USER/EMAIL_PASS not set - OTP for ${email}: ${code}\n`);
    return;
  }
  // Errors are thrown on purpose so the API can tell the user the email was not sent
  const { subject, text, html } = otpEmail({ code, minutes: 5 });
  await t.sendMail({
    from: `"Horizon Attendance" <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text,
    html,
  });
}
