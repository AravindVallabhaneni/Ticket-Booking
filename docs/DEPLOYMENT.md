# Deployment Guide

This project deploys as two services:

- Backend API and WebSocket server on Render
- React frontend on Vercel

The backend must be deployed first so its public URL can be configured in Vercel.

## 1. Prepare the database

Use a hosted PostgreSQL database such as Supabase, Neon, or Render PostgreSQL. Keep the connection string ready as `DATABASE_URL`.

Run the schema migration and seed data from a machine that can connect to the database:

```powershell
cd backend
npm install
npm run migrate
npm run seed
```

Do not commit `.env` files or credentials.

## 2. Deploy the backend on Render

1. Push the repository to GitHub.
2. In Render, choose **New + > Web Service** and select the repository.
3. Use these settings:

   - **Root Directory:** `backend`
   - **Runtime:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`

4. Add these environment variables under **Environment > Environment Variables**:

   ```env
   NODE_ENV=production
   DATABASE_URL=your-hosted-postgresql-connection-string
   JWT_ACCESS_SECRET=generate-a-long-random-secret
   JWT_REFRESH_SECRET=generate-a-different-long-random-secret
   FRONTEND_URL=https://your-project.vercel.app
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=your-sending-gmail-address
   SMTP_PASS=your-gmail-app-password
   EMAIL_FROM=Unthinkable Tickets <your-sending-gmail-address>
   ADMIN_EMAIL=admin@your-domain.com
   ADMIN_PASSWORD=use-a-strong-admin-password
   HOLD_TTL_SECONDS=600
   WAITLIST_OFFER_TTL_SECONDS=900
   WORKER_INTERVAL_SECONDS=10
   ```

   Render supplies `PORT` automatically. The application reads it from `process.env.PORT`.

5. Create the service and wait for the first deploy.
6. Copy the Render URL, for example `https://ticket-booking-api.onrender.com`.
7. Verify the API:

   ```text
   https://ticket-booking-api.onrender.com/api/v1/health
   ```

   It should return JSON with `ok: true`.

### Gmail SMTP

Use a Gmail App Password, not the normal Gmail password. Enable 2-Step Verification on the sending account, create an App Password, and put that value in `SMTP_PASS`.

When a booking is confirmed, the backend generates a QR PNG for the ticket URL and sends it as an email attachment. If SMTP is missing or invalid, the booking remains confirmed but the email cannot be delivered, so check Render logs after the first test booking.

## 3. Deploy the frontend on Vercel

1. In Vercel, choose **Add New > Project** and import the same GitHub repository.
2. Set:

   - **Root Directory:** `frontend`
   - **Framework Preset:** `Vite`
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

3. Add these Production environment variables:

   ```env
   VITE_API_URL=https://ticket-booking-api.onrender.com/api/v1
   VITE_WS_URL=wss://ticket-booking-api.onrender.com/ws
   ```

   Replace the hostname with the actual Render URL. Do not use `localhost` in Vercel variables.

4. Deploy the project and copy its public URL.
5. Return to Render and update `FRONTEND_URL` to that exact Vercel URL, for example:

   ```env
   FRONTEND_URL=https://ticket-booking-psi-orcin.vercel.app
   ```

6. Redeploy the Render service after changing `FRONTEND_URL`.

## 4. Verify the deployment

Check these URLs:

```text
Frontend: https://your-project.vercel.app
API:      https://ticket-booking-api.onrender.com/api/v1/health
```

Then test the complete flow:

1. Open the frontend and confirm events load.
2. Register a new account and verify its email.
3. Sign in, select seats, hold them, and confirm the booking.
4. Confirm the booking email arrives with `ticket.png` attached.
5. Scan or open the QR code and verify the ticket page.
6. Check Render logs if email delivery fails.

## Notes

Render Web Services support the WebSocket endpoint used by the live seat map. Render's local filesystem is ephemeral; the QR file is generated for the booking email, but files stored under `backend/uploads` should not be treated as permanent storage. Use object storage such as S3 or Cloudinary if QR images must remain permanently downloadable.

After changing any `VITE_*` variable, redeploy Vercel because Vite embeds these values during the build.