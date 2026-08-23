import crypto from 'crypto';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function bookingReference() {
  return `MQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}
