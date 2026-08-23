/**
 * Concurrent hold demo — two customers, one seat.
 * Usage: node scripts/concurrency-demo.js
 * Requires a running API + seeded DB. Override with env:
 *   API_URL, EMAIL_A, EMAIL_B, PASSWORD, SHOW_ID
 */
const API = process.env.API_URL || 'http://localhost:3001/api/v1';

async function login(email, password) {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(`login failed ${email}: ${await res.text()}`);
  return res.json();
}

async function main() {
  const password = process.env.PASSWORD || 'Password123!';
  const a = await login(process.env.EMAIL_A || 'customer@marquee.local', password);

  const emailB = process.env.EMAIL_B;
  let b;
  if (emailB) {
    b = await login(emailB, password);
  } else {
    const uniq = `race-${Date.now()}@marquee.local`;
    const reg = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Racer', email: uniq, password, role: 'customer' }),
    });
    b = await reg.json();
    const token = process.env.VERIFY_BYPASS;
    if (!b.user?.isVerified) {
      console.log('Second user is unverified; using seeded customer vs itself is invalid.');
      console.log('Create a second verified user or verify via email, then rerun with EMAIL_B.');
    }
  }

  const listings = await (await fetch(`${API}/events`)).json();
  const showId = process.env.SHOW_ID || listings.listings?.[0]?.show_id;
  if (!showId) throw new Error('No show found');
  const map = await (await fetch(`${API}/shows/${showId}/seat-map`)).json();
  const seat = map.seats.find((s) => s.status === 'available');
  if (!seat) throw new Error('No available seat');

  const hold = (token) =>
    fetch(`${API}/shows/${showId}/hold`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ venueSeatIds: [seat.id] }),
    }).then(async (r) => ({ status: r.status, body: await r.json() }));

  const [r1, r2] = await Promise.all([hold(a.accessToken), hold(b.accessToken || a.accessToken)]);
  console.log('Seat', seat.row, seat.seatNumber);
  console.log('A:', r1.status, r1.body.error?.code || r1.body.holdId);
  console.log('B:', r2.status, r2.body.error?.code || r2.body.holdId);
  const statuses = [r1.status, r2.status].sort();
  if (!(statuses.includes(201) && statuses.includes(409)) && b.accessToken === a.accessToken) {
    console.log('Note: same user used twice — second request extends/replaces the hold (expected).');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
