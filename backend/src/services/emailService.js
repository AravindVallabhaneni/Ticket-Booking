import nodemailer from 'nodemailer';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

function createTransport() {
  if (!config.smtp.user || !config.smtp.pass) return null;
  return nodemailer.createTransport({
    host: config.smtp.host,
    port: config.smtp.port,
    secure: config.smtp.port === 465,
    auth: { user: config.smtp.user, pass: config.smtp.pass },
  });
}

const transport = createTransport();

export async function sendMail({ to, subject, html, attachments }) {
  const payload = { from: config.emailFrom, to, subject, html, attachments };
  if (!transport) {
    logger.info({ to, subject, html }, 'Email (SMTP not configured — logged only)');
    return { logged: true };
  }
  await transport.sendMail(payload);
  return { sent: true };
}

function escapeHtml(s) {
  return String(s)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function verificationEmailHtml(name, link) {
  return `<p>Hi ${escapeHtml(name)},</p>
    <p>Confirm your Unthinkable Tickets account (link valid 24 hours):</p>
    <p><a href="${link}">${link}</a></p>`;
}

export function ticketEmailHtml(name, reference, eventTitle, when) {
  return `<p>Hi ${escapeHtml(name)},</p>
    <p>Booking <strong>${escapeHtml(reference)}</strong> for <strong>${escapeHtml(eventTitle)}</strong> (${escapeHtml(when)}) is confirmed.</p>
    <p>Show the attached QR code at the venue.</p>`;
}

export function waitlistOfferEmailHtml(name, eventTitle, category, link, minutes) {
  return `<p>Hi ${escapeHtml(name)},</p>
    <p>A ${escapeHtml(category)} seat opened for <strong>${escapeHtml(eventTitle)}</strong>.</p>
    <p>You have ${minutes} minutes to confirm:</p>
    <p><a href="${link}">${link}</a></p>
    <p>If you miss the window, the seat goes to the next person in line.</p>`;
}
