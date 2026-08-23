import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole, requireVerified } from '../middleware/auth.js';
import { notFound, forbidden, badRequest } from '../utils/errors.js';

export const eventsRouter = Router();

eventsRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const type = req.query.type;
    const venueId = req.query.venueId;
    const date = req.query.date;
    const params = [];
    const where = ['s.status = \'scheduled\''];
    if (type) {
      params.push(type);
      where.push(`e.type = $${params.length}`);
    }
    if (venueId) {
      params.push(venueId);
      where.push(`s.venue_id = $${params.length}`);
    }
    if (date) {
      params.push(date);
      where.push(`s.show_date = $${params.length}`);
    }
    const { rows } = await pool.query(
      `SELECT e.id AS event_id, e.title, e.type, e.description,
              s.id AS show_id, s.show_date, s.show_time, s.status,
              v.id AS venue_id, v.name AS venue_name, v.address,
              (SELECT MIN(price) FROM show_seat_pricing p WHERE p.show_id = s.id) AS from_price
       FROM shows s
       JOIN events e ON e.id = s.event_id
       JOIN venues v ON v.id = s.venue_id
       WHERE ${where.join(' AND ')}
       ORDER BY s.show_date, s.show_time`,
      params,
    );
    res.json({ listings: rows });
  }),
);

eventsRouter.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT e.*, u.name AS organiser_name
       FROM events e JOIN users u ON u.id = e.organiser_id
       WHERE e.id = $1`,
      [req.params.id],
    );
    if (!rows[0]) throw notFound('Event not found');
    const shows = await pool.query(
      `SELECT s.*, v.name AS venue_name, v.address,
              json_agg(json_build_object('category', p.category, 'price', p.price))
                FILTER (WHERE p.category IS NOT NULL) AS pricing
       FROM shows s
       JOIN venues v ON v.id = s.venue_id
       LEFT JOIN show_seat_pricing p ON p.show_id = s.id
       WHERE s.event_id = $1
       GROUP BY s.id, v.name, v.address
       ORDER BY s.show_date, s.show_time`,
      [req.params.id],
    );
    res.json({ event: rows[0], shows: shows.rows });
  }),
);

eventsRouter.post(
  '/',
  requireAuth,
  requireRole('organiser', 'admin'),
  requireVerified,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        title: z.string().min(2).max(160),
        type: z.enum(['movie', 'concert']),
        description: z.string().max(2000).default(''),
      })
      .parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO events (organiser_id, title, type, description) VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.user.id, body.title, body.type, body.description],
    );
    res.status(201).json({ event: rows[0] });
  }),
);

eventsRouter.post(
  '/:id/shows',
  requireAuth,
  requireRole('organiser', 'admin'),
  requireVerified,
  asyncHandler(async (req, res) => {
    const body = z
      .object({
        venueId: z.string().uuid(),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
        pricing: z.array(z.object({ category: z.string(), price: z.number().nonnegative() })).min(1),
      })
      .parse(req.body);

    const show = await withTransaction(async (client) => {
      const { rows: ev } = await client.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
      if (!ev[0]) throw notFound('Event not found');
      if (req.user.role !== 'admin' && ev[0].organiser_id !== req.user.id) {
        throw forbidden('Not your event');
      }

      const { rows: seats } = await client.query(
        'SELECT DISTINCT category FROM venue_seats WHERE venue_id = $1',
        [body.venueId],
      );
      if (!seats.length) throw badRequest('Venue has no seats configured');
      const venueCats = new Set(seats.map((s) => s.category));
      for (const p of body.pricing) {
        if (!venueCats.has(p.category)) throw badRequest(`Category ${p.category} is not on this venue`);
      }

      const { rows: created } = await client.query(
        `INSERT INTO shows (event_id, venue_id, show_date, show_time)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [req.params.id, body.venueId, body.date, body.time],
      );
      const showRow = created[0];

      for (const p of body.pricing) {
        await client.query(
          `INSERT INTO show_seat_pricing (show_id, category, price) VALUES ($1, $2, $3)`,
          [showRow.id, p.category, p.price],
        );
      }

      await client.query(
        `INSERT INTO seat_status (show_id, venue_seat_id, status)
         SELECT $1, vs.id, 'available' FROM venue_seats vs WHERE vs.venue_id = $2`,
        [showRow.id, body.venueId],
      );
      return showRow;
    });

    res.status(201).json({ show });
  }),
);
