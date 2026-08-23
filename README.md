# Marquee — Ticket Booking System

Production-oriented booking platform for movies and concerts: live seat maps, atomic seat holds with TTL, waitlists, QR tickets, and role-based dashboards.

**Stack (locked):** React (Vite) · Node.js + Express · PostgreSQL (`pg`) · native `ws` · `node-cron` · JWT · `qrcode` · Nodemailer.

No Docker, Redis, ORM, GraphQL, or message brokers.

---

## Assumptions

- Checkout does **not** call a real payment provider. Confirming a booking is treated as successful payment inside a single database transaction.
- If SMTP env vars are empty, emails are **logged** by the API (verification links, tickets, waitlist offers still work in development).
- Organiser show pricing follows the venue’s seat category names (seed data uses Premium / Standard).
- Default hold TTL is **600s**; waitlist offer TTL is **900s**; worker ticks every **10s** (all env-configurable).

---

## Local setup (no Docker)

### 1. PostgreSQL

Create a database (install PostgreSQL locally if needed):

```sql
CREATE DATABASE ticket_booking;
```

### 2. Backend

```bash
cd backend
copy .env.example .env   # Windows
# cp .env.example .env  # macOS/Linux
```

Edit `DATABASE_URL`, JWT secrets, and optional SMTP settings.

```bash
npm install
npm run migrate
npm run seed
npm run dev
```

API: `http://localhost:3001` · WebSocket: `ws://localhost:3001/ws`

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```
http://localhost:5173
UI: `` (Vite proxies `/api`, `/uploads`, and `/ws` to the API).

### Seeded accounts (all verified except the last)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@marquee.local` | `AdminPass123!` |
| Organiser | `organiser@marquee.local` | `Password123!` |
| Customer | `customer@marquee.local` | `Password123!` |
| Unverified customer | `unverified@marquee.local` | `Password123!` |

---

## Environment

See `backend/.env.example`:

```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ticket_booking
JWT_ACCESS_SECRET=change-me-access-secret-min-32-chars
JWT_REFRESH_SECRET=change-me-refresh-secret-min-32-chars
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d
HOLD_TTL_SECONDS=600
WAITLIST_OFFER_TTL_SECONDS=900
WORKER_INTERVAL_SECONDS=10
FRONTEND_URL=http://localhost:5173
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
EMAIL_FROM="Marquee Tickets <noreply@example.com>"
ADMIN_EMAIL=admin@marquee.local
ADMIN_PASSWORD=AdminPass123!
```

Frontend: `frontend/.env.example` (`VITE_API_URL=/api/v1`). For production, set `VITE_API_URL` and `VITE_WS_URL` to the public API/WebSocket origins.

---

## Seat hold & waitlist (summary)

**Hold:** `POST /shows/:id/hold` opens a transaction, `SELECT ... FOR UPDATE` on the requested `seat_status` rows (ordered by id to avoid deadlocks), and sets `held` + `held_until` only if every seat is `available` (or already held by the same user). Anyone else receives **409**. A `node-cron` worker releases rows where `status = 'held' AND held_until < now()` using `FOR UPDATE SKIP LOCKED`, then broadcasts over WebSockets.

**Checkout:** `POST /bookings` re-locks the hold, checks ownership + TTL, inserts `bookings` / `booking_seats`, flips seats to `booked`, generates a QR PNG, and emails it — seat mutation and booking insert share one transaction.

**Waitlist:** Join only when that category has zero `available` seats. On cancel (or expired waitlist hold), the freed seat is immediately re-held for the FIFO `waiting` customer, status becomes `offered`, and they get a time-limited link. Expiry marks the entry `expired` and repeats for the next person.

Design detail: [`docs/SYSTEM_DESIGN.md`](docs/SYSTEM_DESIGN.md). Concurrency demo: `npm run concurrency-demo` in `backend` (API must be running). Integration tests: `npm test` (uses `DATABASE_URL`).

---

## Database schema

```
users ─┬─ email_verification_tokens
       ├─ refresh_tokens
       ├─ venues ─┬─ seat_categories
       │          └─ venue_seats
       ├─ events ─── shows ─┬─ show_seat_pricing
       │                    └─ seat_status (PK: show_id + venue_seat_id)
       ├─ bookings ── booking_seats
       └─ waitlist
```

Indexes: `seat_status(show_id, status)`, `waitlist(show_id, category, status, position)`. Partial unique index prevents two active (`waiting`/`offered`) waitlist rows per user/show/category. One occupancy row per show seat is enforced by the `seat_status` primary key.

---

## API (`/api/v1`)

Auth header: `Authorization: Bearer <accessToken>`. JSON errors: `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health` | no | Liveness |
| POST | `/auth/register` | no | `{ name, email, password, role: customer\|organiser }` → tokens; sends verify email |
| POST | `/auth/login` | no | `{ email, password }` |
| POST | `/auth/refresh` | no | `{ refreshToken }` rotates refresh token |
| GET | `/auth/verify?token=` | no | Consumes hashed token, sets `is_verified` |
| POST | `/auth/resend-verification` | no | `{ email }`, 1/min |
| GET | `/auth/me` | yes | Current user |
| GET | `/venues` | no | Filter helpers |
| GET | `/events` | no | Query: `type`, `date`, `venueId` |
| GET | `/events/:id` | no | Event + shows |
| POST | `/events` | organiser/admin, verified | Create event |
| POST | `/events/:id/shows` | owner, verified | `{ venueId, date, time, pricing[] }` — copies venue seats into `seat_status` |
| GET | `/shows/:id/seat-map` | no | Layout + live status + prices |
| POST | `/shows/:id/hold` | customer verified | `{ venueSeatIds }` → `{ holdId, heldUntil }` **201** / **409** |
| DELETE | `/holds/:id` | owner | Manual release |
| POST | `/bookings` | verified | `{ holdId }` confirms + QR email |
| GET | `/bookings/me` | yes | History |
| POST | `/bookings/:id/cancel` | owner verified | Waitlist reallocation |
| POST | `/waitlist` | verified | `{ showId, category }` |
| GET | `/waitlist/me` | yes | |
| POST | `/waitlist/:id/confirm` | owner verified | `{ token }` time-limited offer |
| GET | `/organiser/events` | organiser/admin | |
| GET | `/organiser/events/:id/summary` | owner | Bookings + revenue |
| GET | `/admin/venues` | admin | |
| POST | `/admin/venues` | admin | `{ name, address }` |
| GET | `/admin/venues/:id` | admin | Layout |
| POST | `/admin/venues/:id/seats` | admin | Replace layout if no shows exist |

**403 `EMAIL_NOT_VERIFIED`:** hold, book, waitlist, and organiser mutations require `is_verified`.

**WebSocket** `ws://host/ws` — send `{ "type": "subscribe", "showId" }`; receive `{ "type": "seat_update", "showId", "seats": [{ venueSeatId, status }] }`.

---

## Tests

```bash
cd backend
npm test
npm run concurrency-demo
```

The seating test fires two overlapping `holdSeats` calls on one row; PostgreSQL row locks ensure a single  success. The waitlist test books, joins a sold-out category, cancels (offer created), then backdates `held_until` and runs the expiry worker.

---

## Deploy (Render / Railway + Vercel)

A public URL is **not included in this repo** — it requires your account. Suggested split:

1. **Postgres** — Railway or Render PostgreSQL. Run `npm run migrate` and `npm run seed` as a release command.
2. **API** — Node web service, root `backend`, start `npm start`, health `/api/v1/health`. Set every backend env var. Use a long-lived SMTP user (Gmail app password or Resend SMTP).
3. **Frontend** — Vercel, root `frontend`, `npm run build`. Set `VITE_API_URL=https://your-api.com/api/v1` and `VITE_WS_URL=wss://your-api.com/ws`. Set API `FRONTEND_URL` to the Vercel origin (CORS).

Keep the expiry worker in-process (`node-cron` starts with the API). Use a single API instance so hold expiry and WebSocket broadcasts stay on the same process; multiple instances would split WS subscribers without a shared bus (intentionally out of scope).

---

## Project layout

```
backend/src          Express app, services, WS hub, cron worker
backend/migrations   SQL migrations
backend/tests        Hold concurrency + waitlist
frontend/src         React pages (customer, organiser, admin)
docs/SYSTEM_DESIGN.md
```
