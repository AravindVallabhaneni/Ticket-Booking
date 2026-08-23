import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { after, before, test } from 'node:test';
import dotenv from 'dotenv';
import pg from 'pg';
import bcrypt from 'bcrypt';
import { v4 as uuid } from 'uuid';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;
if (!databaseUrl) {
  console.log('Skipping tests: DATABASE_URL not set');
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: databaseUrl });

async function user(email, role = 'customer') {
  const hash = await bcrypt.hash('Password123!', 4);
  const { rows } = await pool.query(
    `INSERT INTO users (name, email, password_hash, role, is_verified)
     VALUES ($1, $2, $3, $4, true)
     ON CONFLICT (email) DO UPDATE SET is_verified = true
     RETURNING *`,
    [email, email, hash, role],
  );
  return rows[0];
}

let showId;
let seatA;
let seatB;
let category;

before(async () => {
  const { holdSeats, confirmBooking, cancelBooking, joinWaitlist, expireHoldsAndOffers } = await import(
    '../src/services/seatingService.js'
  );
  globalThis.__seating = { holdSeats, confirmBooking, cancelBooking, joinWaitlist, expireHoldsAndOffers };

  const admin = await user(`admin-${uuid()}@test.local`, 'admin');
  const org = await user(`org-${uuid()}@test.local`, 'organiser');
  const v = await pool.query(
    `INSERT INTO venues (name, address, created_by_admin_id) VALUES ('T', 'A', $1) RETURNING *`,
    [admin.id],
  );
  const venueId = v.rows[0].id;
  await pool.query(`INSERT INTO seat_categories (venue_id, name, base_price) VALUES ($1, 'Standard', 10)`, [
    venueId,
  ]);
  const s1 = await pool.query(
    `INSERT INTO venue_seats (venue_id, section, row_label, seat_number, category)
     VALUES ($1, 'Main', 'A', 1, 'Standard') RETURNING *`,
    [venueId],
  );
  const s2 = await pool.query(
    `INSERT INTO venue_seats (venue_id, section, row_label, seat_number, category)
     VALUES ($1, 'Main', 'A', 2, 'Standard') RETURNING *`,
    [venueId],
  );
  seatA = s1.rows[0].id;
  seatB = s2.rows[0].id;
  category = 'Standard';
  const ev = await pool.query(
    `INSERT INTO events (organiser_id, title, type) VALUES ($1, 'Test', 'movie') RETURNING *`,
    [org.id],
  );
  const sh = await pool.query(
    `INSERT INTO shows (event_id, venue_id, show_date, show_time) VALUES ($1, $2, CURRENT_DATE + 1, '19:00') RETURNING *`,
    [ev.rows[0].id, venueId],
  );
  showId = sh.rows[0].id;
  await pool.query(`INSERT INTO show_seat_pricing (show_id, category, price) VALUES ($1, 'Standard', 10)`, [showId]);
  await pool.query(
    `INSERT INTO seat_status (show_id, venue_seat_id, status)
     VALUES ($1, $2, 'available'), ($1, $3, 'available')`,
    [showId, seatA, seatB],
  );
});

after(async () => {
  await pool.end();
});

test('concurrent holds: only one winner for the same seat', async () => {
  const { holdSeats } = globalThis.__seating;
  const u1 = await user(`c1-${uuid()}@test.local`);
  const u2 = await user(`c2-${uuid()}@test.local`);
  const results = await Promise.allSettled([
    holdSeats({ userId: u1.id, showId, venueSeatIds: [seatA] }),
    holdSeats({ userId: u2.id, showId, venueSeatIds: [seatA] }),
  ]);
  const wins = results.filter((r) => r.status === 'fulfilled');
  const losses = results.filter((r) => r.status === 'rejected');
  assert.equal(wins.length, 1);
  assert.equal(losses.length, 1);
  assert.match(String(losses[0].reason?.code || losses[0].reason), /SEAT_UNAVAILABLE|CONFLICT/);
});

test('expired hold is released by worker then waitlist offer is created after cancel', async () => {
  const { holdSeats, confirmBooking, cancelBooking, joinWaitlist, expireHoldsAndOffers } = globalThis.__seating;
  const buyer = await user(`buyer-${uuid()}@test.local`);
  const waiter = await user(`wait-${uuid()}@test.local`);

  const hold = await holdSeats({ userId: buyer.id, showId, venueSeatIds: [seatB] });
  const booking = await confirmBooking({ userId: buyer.id, holdId: hold.holdId });

  const { rows: sold } = await pool.query(
    `SELECT COUNT(*)::int AS n FROM seat_status WHERE show_id = $1 AND status = 'available'`,
    [showId],
  );
  // seat A may still be held from previous test — release it
  await pool.query(
    `UPDATE seat_status SET status = 'booked', hold_id = NULL, held_by_user_id = NULL, held_until = NULL
     WHERE show_id = $1 AND venue_seat_id = $2`,
    [showId, seatA],
  );

  await joinWaitlist({ userId: waiter.id, showId, category });
  await cancelBooking({ userId: buyer.id, bookingId: booking.id });

  const { rows: offered } = await pool.query(
    `SELECT * FROM waitlist WHERE user_id = $1 AND show_id = $2`,
    [waiter.id, showId],
  );
  assert.equal(offered[0].status, 'offered');

  await pool.query(
    `UPDATE seat_status SET held_until = now() - interval '1 second'
     WHERE show_id = $1 AND venue_seat_id = $2`,
    [showId, seatB],
  );
  await expireHoldsAndOffers();
  const { rows: after } = await pool.query(
    `SELECT status FROM waitlist WHERE id = $1`,
    [offered[0].id],
  );
  assert.equal(after[0].status, 'expired');
});
