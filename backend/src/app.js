import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config.js';
import { authRouter } from './routes/auth.js';
import { adminRouter } from './routes/admin.js';
import { eventsRouter } from './routes/events.js';
import { showsRouter } from './routes/shows.js';
import { holdsRouter } from './routes/holds.js';
import { bookingsRouter } from './routes/bookings.js';
import { waitlistRouter } from './routes/waitlist.js';
import { organiserRouter } from './routes/organiser.js';
import { venuesPublicRouter } from './routes/venues.js';
import { errorHandler } from './middleware/errorHandler.js';
import { uploadsRoot } from './services/qrService.js';

export function createApp() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors({ origin: config.frontendUrl, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use('/uploads', express.static(uploadsRoot));

  app.get('/api/v1/health', (_req, res) => {
    res.json({ ok: true, service: 'unthinkable-api' });
  });

  app.use('/api/v1/auth', authRouter);
  app.use('/api/v1/admin', adminRouter);
  app.use('/api/v1/events', eventsRouter);
  app.use('/api/v1/shows', showsRouter);
  app.use('/api/v1/holds', holdsRouter);
  app.use('/api/v1/bookings', bookingsRouter);
  app.use('/api/v1/waitlist', waitlistRouter);
  app.use('/api/v1/organiser', organiserRouter);
  app.use('/api/v1/venues', venuesPublicRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);
  return app;
}
