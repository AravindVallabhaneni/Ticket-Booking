import dotenv from 'dotenv';

dotenv.config();

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  port: Number(process.env.PORT || 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: required('DATABASE_URL'),
  jwtAccessSecret: required('JWT_ACCESS_SECRET'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES || '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES || '7d',
  holdTtlSeconds: Number(process.env.HOLD_TTL_SECONDS || 600),
  waitlistOfferTtlSeconds: Number(process.env.WAITLIST_OFFER_TTL_SECONDS || 900),
  workerIntervalSeconds: Number(process.env.WORKER_INTERVAL_SECONDS || 10),
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
  emailFrom: process.env.EMAIL_FROM || 'Marquee Tickets <noreply@example.com>',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@marquee.local',
  adminPassword: process.env.ADMIN_PASSWORD || 'AdminPass123!',
};
