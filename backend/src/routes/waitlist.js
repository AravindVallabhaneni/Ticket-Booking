import { Router } from 'express';
import { z } from 'zod';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import * as seating from '../services/seatingService.js';

export const waitlistRouter = Router();

waitlistRouter.post(
  '/',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const body = z
      .object({ showId: z.string().uuid(), category: z.string().min(1) })
      .parse(req.body);
    const entry = await seating.joinWaitlist({
      userId: req.user.id,
      showId: body.showId,
      category: body.category,
    });
    res.status(201).json({ waitlist: entry });
  }),
);

waitlistRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query(
      `SELECT w.*, e.title, s.show_date, s.show_time, v.name AS venue_name
       FROM waitlist w
       JOIN shows s ON s.id = w.show_id
       JOIN events e ON e.id = s.event_id
       JOIN venues v ON v.id = s.venue_id
       WHERE w.user_id = $1
       ORDER BY w.created_at DESC`,
      [req.user.id],
    );
    res.json({ waitlist: rows });
  }),
);

waitlistRouter.post(
  '/:id/confirm',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const { token } = z.object({ token: z.string().min(10) }).parse(req.body);
    const booking = await seating.confirmWaitlistOffer({
      waitlistId: req.params.id,
      token,
      userId: req.user.id,
    });
    res.status(201).json({ booking });
  }),
);
