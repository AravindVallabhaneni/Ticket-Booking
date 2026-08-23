import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { forbidden, notFound } from '../utils/errors.js';

export const organiserRouter = Router();
organiserRouter.use(requireAuth, requireRole('organiser', 'admin'));

organiserRouter.get(
  '/events',
  asyncHandler(async (req, res) => {
    const params = req.user.role === 'admin' ? [] : [req.user.id];
    const where = req.user.role === 'admin' ? '' : 'WHERE organiser_id = $1';
    const { rows } = await pool.query(`SELECT * FROM events ${where} ORDER BY created_at DESC`, params);
    res.json({ events: rows });
  }),
);

organiserRouter.get(
  '/events/:id/summary',
  asyncHandler(async (req, res) => {
    const { rows: ev } = await pool.query('SELECT * FROM events WHERE id = $1', [req.params.id]);
    if (!ev[0]) throw notFound('Event not found');
    if (req.user.role !== 'admin' && ev[0].organiser_id !== req.user.id) {
      throw forbidden('Not your event');
    }

    const { rows: shows } = await pool.query(
      `SELECT s.id, s.show_date, s.show_time, s.status, v.name AS venue_name,
              COALESCE((
                SELECT SUM(b.total_amount) FROM bookings b
                WHERE b.show_id = s.id AND b.status = 'confirmed'
              ), 0) AS revenue,
              COALESCE((
                SELECT COUNT(*) FROM bookings b
                WHERE b.show_id = s.id AND b.status = 'confirmed'
              ), 0)::int AS booking_count,
              (
                SELECT COUNT(*) FROM seat_status ss
                WHERE ss.show_id = s.id AND ss.status = 'booked'
              )::int AS seats_sold,
              (
                SELECT COUNT(*) FROM seat_status ss WHERE ss.show_id = s.id
              )::int AS seats_total
       FROM shows s
       JOIN venues v ON v.id = s.venue_id
       WHERE s.event_id = $1
       ORDER BY s.show_date, s.show_time`,
      [req.params.id],
    );

    const revenue = shows.reduce((sum, s) => sum + Number(s.revenue), 0);
    res.json({ event: ev[0], shows, totals: { revenue, shows: shows.length } });
  }),
);
