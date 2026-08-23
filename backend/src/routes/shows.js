import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import { bookingLimiter } from '../middleware/rateLimit.js';
import * as seating from '../services/seatingService.js';

export const showsRouter = Router();

showsRouter.get(
  '/:id/seat-map',
  asyncHandler(async (req, res) => {
    const map = await seating.getSeatMap(req.params.id);
    res.json(map);
  }),
);

showsRouter.post(
  '/:id/hold',
  requireAuth,
  requireVerified,
  bookingLimiter,
  asyncHandler(async (req, res) => {
    const { venueSeatIds } = z
      .object({ venueSeatIds: z.array(z.string().uuid()).min(1).max(10) })
      .parse(req.body);
    const result = await seating.holdSeats({
      userId: req.user.id,
      showId: req.params.id,
      venueSeatIds,
    });
    res.status(201).json(result);
  }),
);
