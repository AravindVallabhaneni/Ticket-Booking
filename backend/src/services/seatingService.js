import { v4 as uuid } from 'uuid';
import { config } from '../config.js';
import { pool, withTransaction } from '../db/pool.js';
import { badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { bookingReference, hashToken, randomToken } from '../utils/tokens.js';
import { broadcastSeatUpdate } from '../ws/seatMapHub.js';
import { generateBookingQr, qrAbsolutePath } from './qrService.js';
import { sendMail, ticketEmailHtml, waitlistOfferEmailHtml } from './emailService.js';
import { logger } from '../utils/logger.js';

function holdUntil(seconds = config.holdTtlSeconds) {
  return new Date(Date.now() + seconds * 1000);
}

async function pushMap(showId) {
  const map = await getSeatMap(showId);
  broadcastSeatUpdate(
    showId,
    map.seats.map((s) => ({ venueSeatId: s.id, status: s.status })),
  );
}

export async function getSeatMap(showId) {
  const show = await pool.query(
    `SELECT s.id, s.show_date, s.show_time, s.status, s.venue_id, s.event_id,
            e.title, e.type, e.description, e.organiser_id,
            v.name AS venue_name, v.address
     FROM shows s
     JOIN events e ON e.id = s.event_id
     JOIN venues v ON v.id = s.venue_id
     WHERE s.id = $1`,
    [showId],
  );
  if (!show.rows[0]) throw notFound('Show not found');

  const pricing = await pool.query(
    'SELECT category, price FROM show_seat_pricing WHERE show_id = $1',
    [showId],
  );
  const priceByCat = Object.fromEntries(pricing.rows.map((p) => [p.category, Number(p.price)]));

  const seats = await pool.query(
    `SELECT vs.id, vs.section, vs.row_label, vs.seat_number, vs.category, ss.status
     FROM seat_status ss
     JOIN venue_seats vs ON vs.id = ss.venue_seat_id
     WHERE ss.show_id = $1
     ORDER BY vs.section, vs.row_label, vs.seat_number`,
    [showId],
  );

  const availability = {};
  for (const seat of seats.rows) {
    availability[seat.category] ??= { total: 0, available: 0 };
    availability[seat.category].total += 1;
    if (seat.status === 'available') availability[seat.category].available += 1;
  }

  return {
    show: show.rows[0],
    pricing: pricing.rows.map((p) => ({ category: p.category, price: Number(p.price) })),
    availability,
    seats: seats.rows.map((s) => ({
      id: s.id,
      section: s.section,
      row: s.row_label,
      seatNumber: s.seat_number,
      category: s.category,
      status: s.status,
      price: priceByCat[s.category] ?? null,
    })),
  };
}

export async function holdSeats({ userId, showId, venueSeatIds }) {
  if (!venueSeatIds?.length) throw badRequest('Select at least one seat');
  const uniqueIds = [...new Set(venueSeatIds)].sort();

  const result = await withTransaction(async (client) => {
    const { rows: showRows } = await client.query(
      `SELECT id, status FROM shows WHERE id = $1 FOR SHARE`,
      [showId],
    );
    if (!showRows[0] || showRows[0].status !== 'scheduled') throw notFound('Show not available');

    const { rows } = await client.query(
      `SELECT ss.*
       FROM seat_status ss
       WHERE ss.show_id = $1 AND ss.venue_seat_id = ANY($2::uuid[])
       ORDER BY ss.venue_seat_id
       FOR UPDATE OF ss`,
      [showId, uniqueIds],
    );
    if (rows.length !== uniqueIds.length) throw notFound('One or more seats do not belong to this show');

    const now = new Date();
    for (const seat of rows) {
      const heldActive = seat.status === 'held' && seat.held_until && new Date(seat.held_until) > now;
      if (seat.status === 'booked') throw conflict('Seat is already booked', 'SEAT_UNAVAILABLE');
      if (heldActive && seat.held_by_user_id !== userId) {
        throw conflict('Seat is currently held by another customer', 'SEAT_UNAVAILABLE');
      }
    }

    await client.query(
      `UPDATE seat_status
       SET status = 'available', held_by_user_id = NULL, held_until = NULL, hold_id = NULL,
           version = version + 1, updated_at = now()
       WHERE show_id = $1 AND held_by_user_id = $2 AND status = 'held'`,
      [showId, userId],
    );

    const holdId = uuid();
    const heldUntil = holdUntil();
    await client.query(
      `UPDATE seat_status
       SET status = 'held', held_by_user_id = $1, held_until = $2, hold_id = $3,
           version = version + 1, updated_at = now()
       WHERE show_id = $4 AND venue_seat_id = ANY($5::uuid[])`,
      [userId, heldUntil, holdId, showId, uniqueIds],
    );

    return { holdId, heldUntil, seats: uniqueIds };
  });

  await pushMap(showId);
  return result;
}

export async function releaseHold({ userId, holdId }) {
  const released = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM seat_status WHERE hold_id = $1 ORDER BY venue_seat_id FOR UPDATE`,
      [holdId],
    );
    if (!rows.length) throw notFound('Hold not found');
    if (rows[0].held_by_user_id !== userId) throw forbidden('Not your hold');
    await client.query(
      `UPDATE seat_status
       SET status = 'available', held_by_user_id = NULL, held_until = NULL, hold_id = NULL,
           version = version + 1, updated_at = now()
       WHERE hold_id = $1 AND status = 'held'`,
      [holdId],
    );
    return { showId: rows[0].show_id };
  });
  await pushMap(released.showId);
  return { released: true };
}

export async function confirmBooking({ userId, holdId }) {
  const booking = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ss.*, vs.category
       FROM seat_status ss
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE ss.hold_id = $1
       ORDER BY ss.venue_seat_id
       FOR UPDATE OF ss`,
      [holdId],
    );
    if (!rows.length) throw notFound('Hold not found or already expired');
    const now = new Date();
    for (const seat of rows) {
      if (seat.held_by_user_id !== userId || seat.status !== 'held') {
        throw conflict('Hold is no longer valid. Please reselect seats.', 'HOLD_INVALID');
      }
      if (!seat.held_until || new Date(seat.held_until) <= now) {
        throw conflict('Hold expired. Please reselect seats.', 'HOLD_EXPIRED');
      }
    }

    const showId = rows[0].show_id;
    const categories = [...new Set(rows.map((r) => r.category))];
    const { rows: prices } = await client.query(
      `SELECT category, price FROM show_seat_pricing WHERE show_id = $1 AND category = ANY($2::text[])`,
      [showId, categories],
    );
    const priceMap = Object.fromEntries(prices.map((p) => [p.category, Number(p.price)]));
    const total = rows.reduce((sum, s) => sum + (priceMap[s.category] || 0), 0);
    const reference = bookingReference();

    const { rows: createdRows } = await client.query(
      `INSERT INTO bookings (user_id, show_id, status, total_amount, booking_reference)
       VALUES ($1, $2, 'confirmed', $3, $4) RETURNING *`,
      [userId, showId, total, reference],
    );
    const created = createdRows[0];

    for (const seat of rows) {
      await client.query(
        `INSERT INTO booking_seats (booking_id, venue_seat_id, show_id) VALUES ($1, $2, $3)`,
        [created.id, seat.venue_seat_id, showId],
      );
    }

    await client.query(
      `UPDATE seat_status
       SET status = 'booked', held_by_user_id = NULL, held_until = NULL, hold_id = NULL,
           version = version + 1, updated_at = now()
       WHERE hold_id = $1`,
      [holdId],
    );
    await client.query(
      `UPDATE waitlist SET status = 'booked'
       WHERE user_id = $1 AND show_id = $2 AND status = 'offered'`,
      [userId, showId],
    );

    return { booking: created, seats: rows, showId };
  });

  const infoRes = await pool.query(
    `SELECT e.title, s.show_date, s.show_time, u.name, u.email
     FROM bookings b
     JOIN shows s ON s.id = b.show_id
     JOIN events e ON e.id = s.event_id
     JOIN users u ON u.id = b.user_id
     WHERE b.id = $1`,
    [booking.booking.id],
  );
  const info = infoRes.rows[0];
  const when = `${String(info.show_date).slice(0, 10)} ${info.show_time}`;

  let qrPath = null;
  try {
    qrPath = await generateBookingQr(booking.booking.booking_reference, {
      reference: booking.booking.booking_reference,
      bookingId: booking.booking.id,
    });
    await pool.query('UPDATE bookings SET qr_code_path = $1 WHERE id = $2', [qrPath, booking.booking.id]);
    const abs = qrAbsolutePath(qrPath);
    await sendMail({
      to: info.email,
      subject: `Your tickets — ${info.title} (${booking.booking.booking_reference})`,
      html: ticketEmailHtml(info.name, booking.booking.booking_reference, info.title, when),
      attachments: abs ? [{ filename: 'ticket.png', path: abs }] : undefined,
    });
  } catch (err) {
    logger.error({ err }, 'QR/email failed after booking (booking still confirmed)');
  }

  await pushMap(booking.showId);
  return { ...booking.booking, qr_code_path: qrPath, seats: booking.seats.map((s) => s.venue_seat_id) };
}

async function offerSeatToWaitlist(client, showId, venueSeatId, category) {
  const { rows: next } = await client.query(
    `SELECT w.*, u.email, u.name, e.title
     FROM waitlist w
     JOIN users u ON u.id = w.user_id
     JOIN shows s ON s.id = w.show_id
     JOIN events e ON e.id = s.event_id
     WHERE w.show_id = $1 AND w.category = $2 AND w.status = 'waiting'
     ORDER BY w.position ASC
     LIMIT 1
     FOR UPDATE OF w SKIP LOCKED`,
    [showId, category],
  );

  if (!next[0]) {
    await client.query(
      `UPDATE seat_status
       SET status = 'available', held_by_user_id = NULL, held_until = NULL, hold_id = NULL,
           version = version + 1, updated_at = now()
       WHERE show_id = $1 AND venue_seat_id = $2`,
      [showId, venueSeatId],
    );
    return { venueSeatId, status: 'available' };
  }

  const token = randomToken();
  const holdId = uuid();
  const until = holdUntil(config.waitlistOfferTtlSeconds);

  await client.query(
    `UPDATE seat_status
     SET status = 'held', held_by_user_id = $1, held_until = $2, hold_id = $3,
         version = version + 1, updated_at = now()
     WHERE show_id = $4 AND venue_seat_id = $5`,
    [next[0].user_id, until, holdId, showId, venueSeatId],
  );
  await client.query(
    `UPDATE waitlist
     SET status = 'offered', offered_at = now(), offer_expires_at = $1,
         offer_token_hash = $2, offered_seat_id = $3
     WHERE id = $4`,
    [until, hashToken(token), venueSeatId, next[0].id],
  );

  return {
    waitlistId: next[0].id,
    email: next[0].email,
    name: next[0].name,
    title: next[0].title,
    category,
    token,
    holdId,
    venueSeatId,
    expiresAt: until,
  };
}

async function sendWaitlistEmail(offer) {
  const minutes = Math.round(config.waitlistOfferTtlSeconds / 60);
  const link = `${config.frontendUrl}/waitlist/confirm?id=${offer.waitlistId}&token=${offer.token}`;
  await sendMail({
    to: offer.email,
    subject: `Seat available — ${offer.title} (expires in ${minutes} min)`,
    html: waitlistOfferEmailHtml(offer.name, offer.title, offer.category, link, minutes),
  });
}

export async function cancelBooking({ userId, bookingId }) {
  const outcome = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM bookings WHERE id = $1 FOR UPDATE`, [bookingId]);
    const booking = rows[0];
    if (!booking) throw notFound('Booking not found');
    if (booking.user_id !== userId) throw forbidden('Not your booking');
    if (booking.status === 'cancelled') throw conflict('Booking already cancelled');

    const { rows: seats } = await client.query(
      `SELECT bs.venue_seat_id, vs.category
       FROM booking_seats bs
       JOIN venue_seats vs ON vs.id = bs.venue_seat_id
       JOIN seat_status ss ON ss.show_id = bs.show_id AND ss.venue_seat_id = bs.venue_seat_id
       WHERE bs.booking_id = $1
       ORDER BY bs.venue_seat_id
       FOR UPDATE OF ss`,
      [bookingId],
    );

    await client.query(
      `UPDATE bookings SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
      [bookingId],
    );

    const offers = [];
    for (const seat of seats) {
      offers.push(await offerSeatToWaitlist(client, booking.show_id, seat.venue_seat_id, seat.category));
    }
    return { showId: booking.show_id, offers };
  });

  await pushMap(outcome.showId);
  for (const offer of outcome.offers) {
    if (offer?.email) sendWaitlistEmail(offer).catch((err) => logger.error({ err }, 'waitlist email failed'));
  }
  return { cancelled: true, waitlistOffers: outcome.offers.filter((o) => o?.waitlistId).length };
}

export async function joinWaitlist({ userId, showId, category }) {
  return withTransaction(async (client) => {
    const { rows: available } = await client.query(
      `SELECT COUNT(*)::int AS n
       FROM seat_status ss
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE ss.show_id = $1 AND vs.category = $2 AND ss.status = 'available'`,
      [showId, category],
    );
    if (available[0].n > 0) throw conflict('Seats are still available in this category', 'NOT_SOLD_OUT');

    const { rows: pos } = await client.query(
      `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM waitlist WHERE show_id = $1 AND category = $2`,
      [showId, category],
    );
    try {
      const { rows } = await client.query(
        `INSERT INTO waitlist (user_id, show_id, category, status, position)
         VALUES ($1, $2, $3, 'waiting', $4) RETURNING *`,
        [userId, showId, category, pos[0].next],
      );
      return rows[0];
    } catch (err) {
      if (err.code === '23505') throw conflict('You are already on this waitlist', 'ALREADY_WAITLISTED');
      throw err;
    }
  });
}

export async function confirmWaitlistOffer({ waitlistId, token, userId }) {
  const hold = await withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM waitlist WHERE id = $1 FOR UPDATE`, [waitlistId]);
    const row = rows[0];
    if (!row) throw notFound('Waitlist entry not found');
    if (userId && row.user_id !== userId) throw forbidden('Not your waitlist offer');
    if (row.status !== 'offered') throw conflict('Offer is not active', 'OFFER_INACTIVE');
    if (!row.offer_token_hash || row.offer_token_hash !== hashToken(token)) throw forbidden('Invalid offer token');
    if (!row.offer_expires_at || new Date(row.offer_expires_at) <= new Date()) {
      throw conflict('Offer expired', 'OFFER_EXPIRED');
    }
    const { rows: seats } = await client.query(
      `SELECT hold_id FROM seat_status
       WHERE show_id = $1 AND venue_seat_id = $2 AND held_by_user_id = $3 AND status = 'held'
       FOR UPDATE`,
      [row.show_id, row.offered_seat_id, row.user_id],
    );
    if (!seats[0]?.hold_id) throw conflict('Seat hold is no longer valid', 'HOLD_INVALID');
    return { holdId: seats[0].hold_id, userId: row.user_id };
  });
  return confirmBooking({ userId: hold.userId, holdId: hold.holdId });
}

export async function expireHoldsAndOffers() {
  const client = await pool.connect();
  const emails = [];
  try {
    await client.query('BEGIN');
    const { rows: expired } = await client.query(
      `SELECT ss.show_id, ss.venue_seat_id, vs.category, ss.held_by_user_id
       FROM seat_status ss
       JOIN venue_seats vs ON vs.id = ss.venue_seat_id
       WHERE ss.status = 'held' AND ss.held_until < now()
       ORDER BY ss.venue_seat_id
       FOR UPDATE OF ss SKIP LOCKED
       LIMIT 100`,
    );
    const touched = new Set();
    for (const seat of expired) {
      touched.add(seat.show_id);
      const { rows: offerRows } = await client.query(
        `SELECT id FROM waitlist
         WHERE show_id = $1 AND offered_seat_id = $2 AND status = 'offered' AND user_id = $3
         FOR UPDATE`,
        [seat.show_id, seat.venue_seat_id, seat.held_by_user_id],
      );
      if (offerRows[0]) {
        await client.query(`UPDATE waitlist SET status = 'expired' WHERE id = $1`, [offerRows[0].id]);
      }
      const offer = await offerSeatToWaitlist(client, seat.show_id, seat.venue_seat_id, seat.category);
      if (offer?.email) emails.push(offer);
    }
    await client.query('COMMIT');
    for (const showId of touched) await pushMap(showId);
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
  for (const offer of emails) {
    sendWaitlistEmail(offer).catch((e) => logger.error({ err: e }, 'waitlist email failed'));
  }
  return { processed: emails.length };
}
