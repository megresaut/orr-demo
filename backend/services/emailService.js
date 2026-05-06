// services/emailService.js — SMTP via nodemailer, no-op if unconfigured.
let nodemailer;
try { nodemailer = require('nodemailer'); } catch { /* optional */ }

function transport() {
  if (!nodemailer) return null;
  if (!process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
}

async function sendEmail({ to, subject, text, html, attachments }) {
  const t = transport();
  if (!t) {
    console.log(`[email] (no SMTP configured) would send to ${to}: ${subject}`);
    return { sent: false, reason: 'smtp_not_configured' };
  }
  const info = await t.sendMail({
    from: process.env.SMTP_FROM || 'billing@orr.local',
    to, subject, text, html, attachments,
  });
  return { sent: true, id: info.messageId };
}

module.exports = { sendEmail };
