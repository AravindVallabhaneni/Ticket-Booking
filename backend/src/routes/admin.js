import { Router } from 'express';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireRole, requireVerified } from '../middleware/auth.js';
import { badRequest, notFound, forbidden } from '../utils/errors.js';

export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole('admin'));

const venueSchema = z.object({
  name: z.string().min(2).max(120),
  address: z.string().min(4).max(240),
});

adminRouter.get(
  '/venues',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT v.*,
              (SELECT COUNT(*)::int FROM venue_seats vs WHERE vs.venue_id = v.id) AS seat_count
       FROM venues v ORDER BY v.created_at DESC`,
    );
    res.json({ venues: rows });
  }),
);

adminRouter.post(
  '/venues',
  asyncHandler(async (req, res) => {
    const body = venueSchema.parse(req.body);
    const { rows } = await pool.query(
      `INSERT INTO venues (name, address, created_by_admin_id) VALUES ($1, $2, $3) RETURNING *`,
      [body.name, body.address, req.user.id],
    );
    res.status(201).json({ venue: rows[0] });
  }),
);

adminRouter.get(
  '/venues/:id',
  asyncHandler(async (req, res) => {
    const { rows } = await pool.query('SELECT * FROM venues WHERE id = $1', [req.params.id]);
    if (!rows[0]) throw notFound('Venue not found');
    const categories = await pool.query('SELECT * FROM seat_categories WHERE venue_id = $1', [req.params.id]);
    const seats = await pool.query(
      `SELECT * FROM venue_seats WHERE venue_id = $1 ORDER BY section, row_label, seat_number`,
      [req.params.id],
    );
    res.json({ venue: rows[0], categories: categories.rows, seats: seats.rows });
  }),
);

const seatsSchema = z.object({
  categories: z
    .array(
      z.object({
        name: z.string().min(1).max(40),
        basePrice: z.number().nonnegative(),
      }),
    )
    .min(1),
  seats: z
    .array(
      z.object({
        section: z.string().min(1).max(40).default('Main'),
        row: z.string().min(1).max(8),
        seatNumber: z.number().int().positive(),
        category: z.string().min(1).max(40),
      }),
    )
    .min(1),
});

adminRouter.post(
  '/venues/:id/seats',
  asyncHandler(async (req, res) => {
    const body = seatsSchema.parse(req.body);
    const venueId = req.params.id;

    const result = await withTransaction(async (client) => {
      const { rows } = await client.query('SELECT id FROM venues WHERE id = $1 FOR UPDATE', [venueId]);
      if (!rows[0]) throw notFound('Venue not found');

      const { rows: used } = await client.query('SELECT 1 FROM shows WHERE venue_id = $1 LIMIT 1', [venueId]);
      if (used[0]) {
        throw forbidden('Cannot rebuild seats after shows have been created for this venue');
      }

      await client.query('DELETE FROM venue_seats WHERE venue_id = $1', [venueId]);
      await client.query('DELETE FROM seat_categories WHERE venue_id = $1', [venueId]);

      for (const cat of body.categories) {
        await client.query(
          `INSERT INTO seat_categories (venue_id, name, base_price) VALUES ($1, $2, $3)`,
          [venueId, cat.name, cat.basePrice],
        );
      }

      const names = new Set(body.categories.map((c) => c.name));
      for (const seat of body.seats) {
        if (!names.has(seat.category)) throw badRequest(`Unknown category ${seat.category}`);
        await client.query(
          `INSERT INTO venue_seats (venue_id, section, row_label, seat_number, category)
           VALUES ($1, $2, $3, $4, $5)`,
          [venueId, seat.section, seat.row, seat.seatNumber, seat.category],
        );
      }

      const seats = await client.query(
        `SELECT * FROM venue_seats WHERE venue_id = $1 ORDER BY row_label, seat_number`,
        [venueId],
      );
      return seats.rows;
    });

    res.status(201).json({ seats: result, count: result.length });
  }),
);
