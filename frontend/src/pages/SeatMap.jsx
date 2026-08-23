import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

function groupRows(seats) {
  const map = new Map();
  for (const seat of seats) {
    const key = `${seat.section}-${seat.row}`;
    if (!map.has(key)) map.set(key, { row: seat.row, seats: [] });
    map.get(key).seats.push(seat);
  }
  return [...map.values()];
}

function wsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}

export default function SeatMap() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [map, setMap] = useState(null);
  const [selected, setSelected] = useState([]);
  const [hold, setHold] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [waitCat, setWaitCat] = useState('');
  const socketRef = useRef(null);

  async function load() {
    const data = await api.get(`/shows/${id}/seat-map`);
    setMap(data);
  }

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, [id]);

  useEffect(() => {
    const ws = new WebSocket(wsUrl());
    socketRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'subscribe', showId: id }));
    ws.onmessage = (ev) => {
      const payload = JSON.parse(ev.data);
      if (payload.type === 'seat_update' && payload.showId === id) {
        setMap((prev) => {
          if (!prev) return prev;
          const statusById = Object.fromEntries(payload.seats.map((s) => [s.venueSeatId, s.status]));
          return {
            ...prev,
            seats: prev.seats.map((s) =>
              statusById[s.id] ? { ...s, status: statusById[s.id] } : s,
            ),
          };
        });
      }
    };
    return () => ws.close();
  }, [id]);

  useEffect(() => {
    if (!hold) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [hold]);

  const remaining = hold ? Math.max(0, Math.floor((new Date(hold.heldUntil) - now) / 1000)) : 0;
  useEffect(() => {
    if (hold && remaining === 0) {
      setHold(null);
      setSelected([]);
      setMsg('Hold expired — seats were released.');
    }
  }, [hold, remaining]);

  const rows = useMemo(() => (map ? groupRows(map.seats) : []), [map]);

  function toggle(seat) {
    if (seat.status !== 'available' && !selected.includes(seat.id)) return;
    setSelected((cur) => (cur.includes(seat.id) ? cur.filter((x) => x !== seat.id) : [...cur, seat.id]));
  }

  async function placeHold() {
    setErr('');
    try {
      const result = await api.post(`/shows/${id}/hold`, { venueSeatIds: selected });
      setHold(result);
      setMsg('Seats held. Complete checkout before the timer ends.');
    } catch (e) {
      setErr(e.message);
      if (e.code === 'EMAIL_NOT_VERIFIED') setMsg('Verify your email first.');
    }
  }

  async function checkout() {
    setErr('');
    try {
      const data = await api.post('/bookings', { holdId: hold.holdId });
      navigate('/bookings', { state: { justBooked: data.booking.booking_reference } });
    } catch (e) {
      setErr(e.message);
    }
  }

  async function joinWait() {
    try {
      await api.post('/waitlist', { showId: id, category: waitCat });
      setMsg(`Joined the ${waitCat} waitlist.`);
    } catch (e) {
      setErr(e.message);
    }
  }

  if (!map) return <p>{err || 'Loading seat map…'}</p>;
  const show = map.show;
  const soldOutCats = Object.entries(map.availability || {}).filter(([, v]) => v.available === 0);

  return (
    <section className="hero">
      <p className="kicker">{show.type}</p>
      <h1>{show.title}</h1>
      <p className="meta">
        {String(show.show_date).slice(0, 10)} · {String(show.show_time).slice(0, 5)} · {show.venue_name}
      </p>
      {user && !user.isVerified && (
        <div className="banner">
          Your account is not verified. You can browse, but holds, bookings, and waitlists are blocked.{' '}
          <Link to="/verify">Resend verification</Link>
        </div>
      )}
      <div className="checkout" style={{ marginTop: 24 }}>
        <div className="seat-stage">
          <div className="screen">SCREEN</div>
          {rows.map((r) => (
            <div className="row" key={r.row}>
              <span className="row-label">{r.row}</span>
              {r.seats.map((seat) => {
                const mine = selected.includes(seat.id);
                const cls = [
                  'seat',
                  seat.category === 'Premium' ? 'premium' : '',
                  mine ? 'mine' : seat.status,
                ].join(' ');
                return (
                  <button
                    key={seat.id}
                    title={`${seat.row}${seat.seatNumber} ${seat.category} £${seat.price}`}
                    className={cls}
                    disabled={seat.status !== 'available' && !mine}
                    onClick={() => toggle(seat)}
                    type="button"
                  />
                );
              })}
            </div>
          ))}
          <div className="legend">
            <span>
              <i style={{ background: 'var(--green)' }} /> Available
            </span>
            <span>
              <i style={{ background: '#5b9bd4' }} /> Selected
            </span>
            <span>
              <i style={{ background: 'var(--held)' }} /> Held
            </span>
            <span>
              <i style={{ background: 'var(--booked)' }} /> Booked
            </span>
          </div>
        </div>
        <aside className="card">
          <h3>Checkout</h3>
          {!user && (
            <p>
              <Link to="/login">Sign in</Link> to hold seats.
            </p>
          )}
          <p>{selected.length} seat(s) selected</p>
          <p>
            £
            {map.seats
              .filter((s) => selected.includes(s.id))
              .reduce((sum, s) => sum + Number(s.price || 0), 0)
              .toFixed(2)}
          </p>
          {hold && (
            <p className="timer">
              {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
            </p>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            <button className="btn" type="button" disabled={!user || !selected.length} onClick={placeHold}>
              Hold seats
            </button>
            <button className="btn secondary" type="button" disabled={!hold} onClick={checkout}>
              Confirm booking
            </button>
            {hold && (
              <button
                className="btn secondary"
                type="button"
                onClick={async () => {
                  await api.del(`/holds/${hold.holdId}`);
                  setHold(null);
                  setSelected([]);
                }}
              >
                Release hold
              </button>
            )}
          </div>
          {soldOutCats.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="meta">A category is sold out — join the waitlist.</p>
              <select value={waitCat} onChange={(e) => setWaitCat(e.target.value)}>
                <option value="">Category</option>
                {soldOutCats.map(([c]) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button className="btn secondary" type="button" style={{ marginTop: 8 }} disabled={!waitCat} onClick={joinWait}>
                Join waitlist
              </button>
            </div>
          )}
          {msg && <p className="ok">{msg}</p>}
          {err && <p className="error">{err}</p>}
        </aside>
      </div>
    </section>
  );
}
