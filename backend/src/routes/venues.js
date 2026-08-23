import { Router } from 'express';
import { pool } from '../db/pool.js';
import { asyncHandler } from '../middleware/errorHandler.js';

export const venuesPublicRouter = Router();

venuesPublicRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const { rows } = await pool.query(
      `SELECT v.id, v.name, v.address,
              (SELECT json_agg(json_build_object('name', c.name, 'basePrice', c.base_price))
               FROM seat_categories c WHERE c.venue_id = v.id) AS categories
       FROM venues v
       ORDER BY v.name`,
    );
    res.json({ venues: rows });
  }),
);
