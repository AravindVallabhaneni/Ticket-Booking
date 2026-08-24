import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';
import { sendMail, verificationEmailHtml } from './emailService.js';
import { conflict, notFound, unauthorized } from '../utils/errors.js';
import { hashToken, randomToken } from '../utils/tokens.js';
import { signAccessToken, signRefreshToken } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const SALT_ROUNDS = 10;

export function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    isVerified: row.is_verified,
    createdAt: row.created_at,
  };
}

async function issueSession(user) {
  const tokenId = uuid();
  const refresh = signRefreshToken(user, tokenId);
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await pool.query(
    `INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)`,
    [tokenId, user.id, hashToken(refresh), expiresAt],
  );
  return {
    accessToken: signAccessToken(user),
    refreshToken: refresh,
    user: publicUser(user),
  };
}

async function createVerification(client, user) {
  const token = randomToken();
  const expires = new Date(Date.now() + 24 * 60 * 60 * 1000);
  await client.query(
    `INSERT INTO email_verification_tokens (user_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, hashToken(token), expires],
  );
  return token;
}

async function sendVerification(user, token) {
  const link = `${config.frontendUrl}/verify?token=${token}`;
  try {
    await sendMail({
      to: user.email,
      subject: 'Verify your Unthinkable Tickets account',
      html: verificationEmailHtml(user.name, link),
    });
  } catch (err) {
    logger.error({ err }, 'verification email failed');
  }
}

export async function register({ name, email, password, role }) {
  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const { user, token } = await withTransaction(async (client) => {
    try {
      const { rows } = await client.query(
        `INSERT INTO users (name, email, password_hash, role, is_verified)
         VALUES ($1, $2, $3, $4, false) RETURNING *`,
        [name, email.toLowerCase(), passwordHash, role],
      );
      const token = await createVerification(client, rows[0]);
      return { user: rows[0], token };
    } catch (err) {
      if (err.code === '23505') throw conflict('Email already registered', 'EMAIL_TAKEN');
      throw err;
    }
  });
  await sendVerification(user, token);
  return issueSession(user);
}

export async function login({ email, password }) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Invalid email or password');
  }
  return issueSession(user);
}

export async function refreshSession(refreshToken) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, config.jwtRefreshSecret);
  } catch {
    throw unauthorized('Invalid refresh token');
  }
  const { rows } = await pool.query(
    `SELECT * FROM refresh_tokens WHERE id = $1 AND revoked_at IS NULL`,
    [payload.jti],
  );
  const stored = rows[0];
  if (!stored || stored.token_hash !== hashToken(refreshToken) || new Date(stored.expires_at) < new Date()) {
    throw unauthorized('Refresh token expired or revoked');
  }
  await pool.query('UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1', [stored.id]);
  const { rows: users } = await pool.query('SELECT * FROM users WHERE id = $1', [payload.sub]);
  if (!users[0]) throw unauthorized();
  return issueSession(users[0]);
}

export async function verifyEmail(token) {
  const hashed = hashToken(token);
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM email_verification_tokens WHERE token_hash = $1 FOR UPDATE`,
      [hashed],
    );
    const row = rows[0];
    if (!row) throw notFound('Invalid verification token');
    if (row.used_at) throw conflict('Token already used', 'TOKEN_USED');
    if (new Date(row.expires_at) < new Date()) throw conflict('Token expired', 'TOKEN_EXPIRED');
    await client.query('UPDATE email_verification_tokens SET used_at = now() WHERE id = $1', [row.id]);
    await client.query('UPDATE users SET is_verified = true WHERE id = $1', [row.user_id]);
    const { rows: users } = await client.query('SELECT * FROM users WHERE id = $1', [row.user_id]);
    return publicUser(users[0]);
  });
}

export async function resendVerification(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
  if (!rows[0] || rows[0].is_verified) return { ok: true };
  const token = await withTransaction(async (client) => {
    await client.query(
      `UPDATE email_verification_tokens SET used_at = now() WHERE user_id = $1 AND used_at IS NULL`,
      [rows[0].id],
    );
    return createVerification(client, rows[0]);
  });
  await sendVerification(rows[0], token);
  return { ok: true };
}
