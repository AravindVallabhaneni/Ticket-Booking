import cron from 'node-cron';
import { config } from '../config.js';
import { expireHoldsAndOffers } from '../services/seatingService.js';
import { logger } from '../utils/logger.js';

let task = null;
let running = false;

export function startExpiryWorker() {
  const seconds = Math.max(5, config.workerIntervalSeconds);
  const expr = seconds >= 60 ? `*/${Math.round(seconds / 60)} * * * *` : `*/${seconds} * * * * *`;
  task = cron.schedule(expr, async () => {
    if (running) return;
    running = true;
    try {
      await expireHoldsAndOffers();
    } catch (err) {
      logger.error({ err }, 'Expiry worker failed');
    } finally {
      running = false;
    }
  });
  logger.info({ seconds }, 'Expiry worker started');
}

export async function stopExpiryWorker() {
  if (task) {
    task.stop();
    task = null;
  }
  const started = Date.now();
  while (running && Date.now() - started < 8000) {
    await new Promise((r) => setTimeout(r, 100));
  }
  logger.info('Expiry worker stopped');
}
