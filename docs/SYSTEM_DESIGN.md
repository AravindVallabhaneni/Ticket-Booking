# System design — Marquee seat inventory

This note explains how seats are held, how two customers cannot take the same seat, and how waitlist offers expire. Payment is simulated: booking confirmation is the commit point.

## Seat hold and TTL

Each show gets one `seat_status` row per venue seat. Status is `available`, `held`, or `booked`. A hold is not a second table: it is the same row with `held_by_user_id`, `held_until`, and a shared `hold_id` for the customer’s current selection.

When a verified customer posts a hold, the API starts a transaction and locks the target rows with `SELECT ... FOR UPDATE`, ordered by `venue_seat_id` so concurrent transactions cannot deadlock. If any row is `booked`, or `held` by someone else with `held_until` still in the future, the API rolls back and returns 409. Otherwise it writes `held` and `held_until = now() + HOLD_TTL_SECONDS` (default ten minutes). The previous hold for that user on the same show is cleared in the same transaction so a shopper can change seats without leaking inventory.

Abandonment is time, not a browser event. A `node-cron` loop (default every ten seconds) selects expired holds with `FOR UPDATE SKIP LOCKED`, sets them back to `available` (or hands them to the waitlist — below), and broadcasts the new map on the show’s WebSocket topic. Checkout must beat the clock: confirm re-locks the hold and refuses if the caller is not the holder or `held_until` has passed.

## Concurrency

Postgres serializes writers on the locked rows. Two simultaneous holds on seat A1 become two transactions; the second waits, then sees `held` and fails. There is no Redis lock. Advisory locks are unnecessary because the occupancy row is the source of truth and already unique on `(show_id, venue_seat_id)`.

This was exercised with a Node test that `Promise.all`s two `holdSeats` calls and asserts exactly one fulfillment, plus `scripts/concurrency-demo.js` against a live API.

## Waitlist auto-assignment

A customer may join a waitlist for `(show_id, category)` only when that category has zero `available` seats. Position is `MAX(position)+1`. A partial unique index blocks duplicate active (`waiting` / `offered`) rows for the same person.

On cancellation, the booking row is marked cancelled and each freed seat is processed in the same transaction: the next `waiting` entry (FIFO, `SKIP LOCKED`) is upgraded to `offered`, the seat is held for that user with `WAITLIST_OFFER_TTL_SECONDS` (default 15 minutes), and a hashed one-time token is stored. Email carries a frontend link that posts `POST /waitlist/:id/confirm` with the raw token. Confirm runs the normal booking path on that hold.

## Time-limited offers

If the offered customer does not confirm, the expiry worker treats the hold like any other TTL: it marks the waitlist row `expired` and immediately runs the same “offer to next waiter or release to available” step. WebSocket clients see `held` while the offer is live and `available` or `booked` afterwards. Offers are single-use: verifying the sha256 token and row status happens under `FOR UPDATE` before booking.

Realtime updates are local to the API process (`ws` hub). That matches the single-node constraint of this stack; horizontal API scaling would need a shared pub/sub, which is explicitly out of scope.
