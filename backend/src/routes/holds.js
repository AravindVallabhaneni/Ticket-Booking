import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireAuth, requireVerified } from '../middleware/auth.js';
import * as seating from '../services/seatingService.js';

export const holdsRouter = Router();

holdsRouter.delete(
  '/:id',
  requireAuth,
  requireVerified,
  asyncHandler(async (req, res) => {
    const result = await seating.releaseHold({ userId: req.user.id, holdId: req.params.id });
    res.json(result);
  }),
);
