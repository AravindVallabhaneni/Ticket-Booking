import bcrypt from 'bcrypt';
import dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });

function futureDate(days, time) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const ymd = d.toISOString().slice(0, 10);
  return { date: ymd, time };
}

async function seed() {
  await client.connect();
  const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'AdminPass123!', 10);
  const demoHash = await bcrypt.hash('Password123!', 10);

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@marquee.local';

  const upsertUser = async (name, email, role, verified = true) => {
    const { rows } = await client.query(
      `INSERT INTO users (name, email, password_hash, role, is_verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
       RETURNING *`,
      [name, email, role === 'admin' ? passwordHash : demoHash, role, verified],
    );
    return rows[0];
  };

  const admin = await upsertUser('Avery Admin', adminEmail, 'admin', true);
  const organiser = await upsertUser('Omar Organiser', 'organiser@marquee.local', 'organiser', true);
  await upsertUser('Casey Customer', 'customer@marquee.local', 'customer', true);
  await upsertUser('Una Unverified', 'unverified@marquee.local', 'customer', false);

  let venue;
  const existing = await client.query(`SELECT * FROM venues WHERE name = 'Riverside Hall'`);
  if (existing.rows[0]) {
    venue = existing.rows[0];
  } else {
    const v = await client.query(
      `INSERT INTO venues (name, address, created_by_admin_id)
       VALUES ('Riverside Hall', '12 Quay Street, Edinburgh', $1) RETURNING *`,
      [admin.id],
    );
    venue = v.rows[0];
    await client.query(
      `INSERT INTO seat_categories (venue_id, name, base_price) VALUES
       ($1, 'Premium', 28), ($1, 'Standard', 16)`,
      [venue.id],
    );
    const rows = 'ABCDEFGH'.split('');
    for (const row of rows) {
      const category = row <= 'B' ? 'Premium' : 'Standard';
      for (let n = 1; n <= 12; n += 1) {
        await client.query(
          `INSERT INTO venue_seats (venue_id, section, row_label, seat_number, category)
           VALUES ($1, 'Main', $2, $3, $4)`,
          [venue.id, row, n, category],
        );
      }
    }
  }

  async function ensureEvent(title, type, description) {
    const found = await client.query(`SELECT * FROM events WHERE title = $1 AND organiser_id = $2 LIMIT 1`, [
      title,
      organiser.id,
    ]);
    if (found.rows[0]) return found.rows[0];
    const created = await client.query(
      `INSERT INTO events (organiser_id, title, type, description)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [organiser.id, title, type, description],
    );
    return created.rows[0];
  }

  const eventRow = await ensureEvent(
    'Night Train to Lisbon',
    'movie',
    'A restored 35mm print with a live intro.',
  );
  const concert = await ensureEvent(
    'The Harbour Quartet',
    'concert',
    'Chamber folk under the rafters.',
  );

  async function makeShow(eventId, days, time, premium, standard) {
    const { date } = futureDate(days, time);
    const exists = await client.query(
      `SELECT 1 FROM shows WHERE event_id = $1 AND show_date = $2 AND show_time = $3`,
      [eventId, date, time],
    );
    if (exists.rows[0]) return;
    const { rows } = await client.query(
      `INSERT INTO shows (event_id, venue_id, show_date, show_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [eventId, venue.id, date, time],
    );
    const show = rows[0];
    await client.query(
      `INSERT INTO show_seat_pricing (show_id, category, price) VALUES
       ($1, 'Premium', $2), ($1, 'Standard', $3)`,
      [show.id, premium, standard],
    );
    await client.query(
      `INSERT INTO seat_status (show_id, venue_seat_id, status)
       SELECT $1, vs.id, 'available' FROM venue_seats vs WHERE vs.venue_id = $2`,
      [show.id, venue.id],
    );
  }

  if (eventRow) {
    await makeShow(eventRow.id, 3, '19:30', 24, 14);
    await makeShow(eventRow.id, 4, '21:00', 24, 14);
  }
  if (concert) {
    await makeShow(concert.id, 10, '20:00', 32, 18);
  }

  console.log('Seed complete.');
  console.log('Admin:     ', adminEmail, '/', process.env.ADMIN_PASSWORD || 'AdminPass123!');
  console.log('Organiser: organiser@marquee.local / Password123!');
  console.log('Customer:  customer@marquee.local / Password123!');
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
