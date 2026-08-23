import http from 'http';
import { config } from './config.js';
import { createApp } from './app.js';
import { pool } from './db/pool.js';
import { attachSeatHub } from './ws/seatMapHub.js';
import { startExpiryWorker, stopExpiryWorker } from './workers/expiryWorker.js';
import { logger } from './utils/logger.js';

const app = createApp();
const server = http.createServer(app);
attachSeatHub(server);
startExpiryWorker();

server.listen(config.port, () => {
  logger.info({ port: config.port }, 'Marquee API listening');
});

async function shutdown(signal) {
  logger.info({ signal }, 'Shutting down');
  server.close();
  await stopExpiryWorker();
  await pool.end();
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
