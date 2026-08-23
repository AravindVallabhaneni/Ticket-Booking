# Marquee Ticket Booking System - Quick Start Guide

## 🚀 Getting Started in 5 Minutes

### Prerequisites
- Node.js v18+
- PostgreSQL 12+ (running locally or accessible)

---

## Step 1: Setup Database

```bash
# Create the database
createdb ticket_booking

# Or using psql
psql -U postgres -c "CREATE DATABASE ticket_booking;"
```

---

## Step 2: Install & Setup Backend

```bash
cd backend
npm install
npm run migrate    # Creates schema
npm run seed       # Adds demo data
```

This creates:
- **Admin:** admin@marquee.local / AdminPass123!
- **Organiser:** organiser@marquee.local / Password123!
- **Customer:** customer@marquee.local / Password123!
- **Demo Venue:** Riverside Hall (with Premium/Standard seats)

---

## Step 3: Install & Setup Frontend

```bash
cd frontend
npm install
```

---

## Step 4: Start Services

### Option A: Both together (from root)
```bash
npm run dev
```

### Option B: Separately
```bash
# Terminal 1: Backend (http://localhost:3001)
cd backend && npm run dev

# Terminal 2: Frontend (http://localhost:5173)
cd frontend && npm run dev
```

---

## Step 5: Open in Browser

```
http://localhost:5173
```

---

## 🧪 Test It Out

### As a Customer
1. Click "Join" → Register or use demo account
2. Go to "What's on" → Browse events
3. Click an event → Select a show
4. Choose seats → "Place hold" (10 min countdown)
5. Click "Book now" → Confirm
6. Check "My tickets" → See booking + QR code

### As an Organiser
1. Sign in: organiser@marquee.local / Password123!
2. Click "Organiser" → Create new event/show
3. Set pricing per seat category
4. View "Summary" → See revenue + bookings

### As an Admin
1. Sign in: admin@marquee.local / AdminPass123!
2. Click "Admin" → Create new venue
3. Configure seat layout (rows A-H, 12 seats each)
4. Assign Premium/Standard categories

---

## 🎮 Try Key Features

### Seat Hold & Checkout
1. Select 2-3 seats
2. Place hold (notice countdown timer)
3. See seats turn yellow (held)
4. Book before timer expires
5. Receive confirmation with booking reference

### Booking Cancellation
1. Go to "My tickets"
2. Click "Cancel booking"
3. Watch as seats go to waitlist queue

### Waitlist Auto-Offer
1. Join waitlist when category is sold out
2. When a seat opens (via cancellation), next person gets notified
3. Accept offer via email link (15 min window)
4. Booking auto-confirmed

### Real-Time Updates
1. Open seat map in 2 browsers (same show)
2. Hold a seat in one browser
3. Other browser updates instantly via WebSocket

---

## 🧪 Run Tests

```bash
cd backend

# Run concurrency + waitlist tests
npm test

# Live demo: two customers racing for same seat
npm run concurrency-demo
```

---

## 📝 Environment Files

Both `.env` files are **already created**:

**backend/.env**
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgres://postgres:postgres@localhost:5432/ticket_booking
JWT_ACCESS_SECRET=your-secure-access-token-secret-min-32-chars-required-here
JWT_REFRESH_SECRET=your-secure-refresh-token-secret-min-32-chars-required-here
HOLD_TTL_SECONDS=600
WAITLIST_OFFER_TTL_SECONDS=900
WORKER_INTERVAL_SECONDS=10
FRONTEND_URL=http://localhost:5173
```

**frontend/.env**
```
VITE_API_URL=/api/v1
```

> **Note:** To use real email (SMTP), add credentials to backend/.env

---

## 🔧 Troubleshooting

### "connect ECONNREFUSED 127.0.0.1:5432"
PostgreSQL not running or wrong DATABASE_URL
```bash
# Check PostgreSQL status
brew services list          # macOS
sudo systemctl status postgresql  # Linux

# Or start it
brew services start postgresql
```

### "Cannot GET /api/v1/health"
Backend not running
```bash
cd backend && npm run dev
```

### Seats not updating in real-time?
WebSocket not connected. Check:
- Browser console for WebSocket errors
- Backend logs for connection issues
- Vite proxy config in `frontend/vite.config.js`

### Email not sending?
Check backend logs:
- If SMTP not configured, emails are **logged** (not sent)
- Verification links still work (token-based)
- For real SMTP, set `SMTP_USER` and `SMTP_PASS`

---

## 📚 Learn More

- **System Design:** [docs/SYSTEM_DESIGN.md](docs/SYSTEM_DESIGN.md)
- **Full Docs:** [PROJECT_COMPLETION_SUMMARY.md](PROJECT_COMPLETION_SUMMARY.md)
- **Architecture:** Seat holds → Bookings → Waitlist cascade
- **Database:** PostgreSQL with transactions + indexes

---

## 🎯 Key Concepts

### Seat Hold
- **TTL:** 10 minutes (configurable)
- **Expiry:** Automatic via cron worker every 10s
- **Concurrency:** PostgreSQL row locks prevent double-booking

### Booking
- **Atomic:** Hold lock + booking insert + QR + email in one transaction
- **Reference:** Unique code for verification
- **QR:** PNG ticket with booking reference + ID

### Waitlist
- **FIFO:** Position-based queue per category
- **Auto-Offer:** Next person offered seat when one opens
- **Time-Limited:** 15 minute window to confirm
- **Cascade:** If offer expires, next person auto-offered

---

## 🚀 Next Steps

### Local Development
- Modify features in `backend/src` or `frontend/src`
- Changes auto-reload with `--watch` or Vite HMR
- Run tests: `npm test`

### Deployment
1. Set strong JWT secrets in .env
2. Configure real SMTP
3. Deploy PostgreSQL to cloud (Railway, Render, AWS)
4. Deploy API (Render, Railway, Fly.io)
5. Deploy frontend (Vercel, Netlify)
6. Update `FRONTEND_URL` and proxy URLs

### Adding Features
- Database changes → add new migration to `backend/migrations/`
- API endpoints → add to `backend/src/routes/`
- Frontend pages → add to `frontend/src/pages/`

---

## ✅ Checklist

- ✅ Database created
- ✅ Backend installed & migrated
- ✅ Frontend installed
- ✅ Services running
- ✅ Can access http://localhost:5173
- ✅ Can log in as demo user
- ✅ Can see events
- ✅ Can select seats & place hold
- ✅ Can book & see QR code

🎉 **Ready to go!**

---

**Questions?** Check logs:
```bash
# Backend logs in terminal where npm run dev was executed
# Frontend errors in browser console (F12 → Console tab)
```
