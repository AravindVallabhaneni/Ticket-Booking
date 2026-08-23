-- Ticket Booking System initial schema

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('customer', 'organiser', 'admin');
CREATE TYPE event_type AS ENUM ('movie', 'concert');
CREATE TYPE show_status AS ENUM ('scheduled', 'cancelled', 'completed');
CREATE TYPE seat_status_enum AS ENUM ('available', 'held', 'booked');
CREATE TYPE booking_status AS ENUM ('confirmed', 'cancelled');
CREATE TYPE waitlist_status AS ENUM ('waiting', 'offered', 'expired', 'booked');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role user_role NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE email_verification_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);

CREATE TABLE refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  created_by_admin_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE seat_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_price NUMERIC(10, 2) NOT NULL CHECK (base_price >= 0),
  UNIQUE (venue_id, name)
);

CREATE TABLE venue_seats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  section TEXT NOT NULL DEFAULT 'Main',
  row_label TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  category TEXT NOT NULL,
  UNIQUE (venue_id, section, row_label, seat_number)
);

CREATE INDEX idx_venue_seats_venue ON venue_seats(venue_id);

CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organiser_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  title TEXT NOT NULL,
  type event_type NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_events_organiser ON events(organiser_id);

CREATE TABLE shows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
  show_date DATE NOT NULL,
  show_time TIME NOT NULL,
  status show_status NOT NULL DEFAULT 'scheduled',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shows_event ON shows(event_id);
CREATE INDEX idx_shows_venue_date ON shows(venue_id, show_date);

CREATE TABLE show_seat_pricing (
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
  PRIMARY KEY (show_id, category)
);

CREATE TABLE seat_status (
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  venue_seat_id UUID NOT NULL REFERENCES venue_seats(id) ON DELETE CASCADE,
  status seat_status_enum NOT NULL DEFAULT 'available',
  held_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  held_until TIMESTAMPTZ,
  hold_id UUID,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (show_id, venue_seat_id)
);

CREATE INDEX idx_seat_status_show_status ON seat_status(show_id, status);
CREATE INDEX idx_seat_status_hold ON seat_status(hold_id) WHERE hold_id IS NOT NULL;
CREATE INDEX idx_seat_status_held_until ON seat_status(held_until) WHERE status = 'held';

-- One active hold/booked occupancy per show seat (the PK already enforces one row).
-- Additional guard: a seat cannot be held twice with different hold_ids at once
-- because there is only one row per (show_id, venue_seat_id).

CREATE TABLE bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE RESTRICT,
  status booking_status NOT NULL DEFAULT 'confirmed',
  total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
  booking_reference TEXT NOT NULL UNIQUE,
  qr_code_path TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_show ON bookings(show_id);

CREATE TABLE booking_seats (
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  venue_seat_id UUID NOT NULL,
  show_id UUID NOT NULL,
  PRIMARY KEY (booking_id, venue_seat_id),
  FOREIGN KEY (show_id, venue_seat_id) REFERENCES seat_status(show_id, venue_seat_id) ON DELETE RESTRICT
);

CREATE TABLE waitlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  show_id UUID NOT NULL REFERENCES shows(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  status waitlist_status NOT NULL DEFAULT 'waiting',
  position INTEGER NOT NULL,
  offered_at TIMESTAMPTZ,
  offer_expires_at TIMESTAMPTZ,
  offer_token_hash TEXT,
  offered_seat_id UUID REFERENCES venue_seats(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_waitlist_queue ON waitlist(show_id, category, status, position);
CREATE UNIQUE INDEX waitlist_active_unique
  ON waitlist (user_id, show_id, category)
  WHERE status IN ('waiting', 'offered');
