import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';
import * as seating from '../services/seatingService.js';

export const bookingsRouter = Router();

bookingsRouter.post(
  '/',
  requireAuth,
  requireVerified,
  bookingLimiter,
  asyncHandler(async (req, res) => {
    const { holdId } = z.object({ holdId: z.string().uuid() }).parse(req.body);
    const booking = await seating.confirmBooking({ userId: req.user.id, holdId });
    res.status(201).json({ booking });
  }),
);

bookingsRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT b.*, e.title, e.type, s.show_date, s.show_time, v.name AS venue_name,
              json_agg(json_build_object(
                'venueSeatId', vs.id,
                'row', vs.row_label,
                'seatNumber', vs.seat_number,
                'category', vs.category
              )) AS seats
       FROM bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN events e ON e.id = s.event_id
       JOIN venues v ON v.id = s.venue_id
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN venue_seats vs ON vs.id = bs.venue_seat_id
       WHERE b.user_id = $1
       GROUP BY b.id, e.title, e.type, s.show_date, s.show_time, v.name
       ORDER BY b.created_at DESC`,
      [req.user.id],
    );
    res.json({ bookings: rows });
  }),
);

bookingsRouter.get(
  '/verify/:reference',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT b.booking_reference, b.status, b.total_amount,
              e.title, e.type, s.show_date, s.show_time, v.name AS venue_name,
              json_agg(json_build_object(
                'row', vs.row_label,
                'seatNumber', vs.seat_number,
                'category', vs.category
              ) ORDER BY vs.row_label, vs.seat_number) AS seats
       FROM bookings b
       JOIN shows s ON s.id = b.show_id
       JOIN events e ON e.id = s.event_id
       JOIN venues v ON v.id = s.venue_id
       JOIN booking_seats bs ON bs.booking_id = b.id
       JOIN venue_seats vs ON vs.id = bs.venue_seat_id
       WHERE b.booking_reference = $1
       GROUP BY b.id, e.title, e.type, s.show_date, s.show_time, v.name`,
      [req.params.reference],
    );
    if (!rows[0]) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Ticket not found' } });
    res.json({ ticket: rows[0] });
  }),
);

bookingsRouter.post(
  '/:id/cancel',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const result = await seating.cancelBooking({ userId: req.user.id, bookingId: req.params.id });
    res.json(result);
  }),
);
