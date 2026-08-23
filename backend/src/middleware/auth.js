import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { forbidden, unauthorized } from '../utils/errors.js';

export function signAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, email: user.email },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpires },
  );
}

export function signRefreshToken(user, tokenId) {
  return jwt.sign({ sub: user.id, jti: tokenId }, config.jwtRefreshSecret, {
    expiresIn: config.jwtRefreshExpires,
  });
}

export async function requireAuth(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw unauthorized();
    const payload = jwt.verify(token, config.jwtAccessSecret);
    const { rows } = await pool.query(
      'SELECT id, name, email, role, is_verified FROM users WHERE id = $1',
      [payload.sub],
    );
    if (!rows[0]) throw unauthorized('User no longer exists');
    req.user = rows[0];
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') return next(unauthorized('Access token expired'));
    next(err.status ? err : unauthorized());
  }
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) return next(forbidden('Insufficient role'));
    next();
  };
}

export function requireVerified(req, _res, next) {
  if (!req.user?.is_verified) {
    return next(
      forbidden(
        'Verify your email before holding seats, booking, or joining a waitlist.',
        'EMAIL_NOT_VERIFIED',
      ),
    );
  }
  next();
}
