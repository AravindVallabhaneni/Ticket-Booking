import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api } from '../api/client.js';

export default function Bookings() {
  const loc = useLocation();
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState('');

  async function load() {
    const data = await api.get('/bookings/me');
    setRows(data.bookings);
  }

  useEffect(() => {
    load().catch((e) => setErr(e.message));
  }, []);

  async function cancel(id) {
    if (!confirm('Cancel this booking? Freed seats go to the waitlist.')) return;
    await api.post(`/bookings/${id}/cancel`);
    await load();
  }

  return (
    <section className="hero">
      <p className="kicker">Tickets</p>
      <h1>Booking history</h1>
      {loc.state?.justBooked && <p className="ok">Booked {loc.state.justBooked}. Check your email for the QR ticket.</p>}
      {err && <p className="error">{err}</p>}
      <table className="table">
        <thead>
          <tr>
            <th>Ref</th>
            <th>Event</th>
            <th>When</th>
            <th>Seats</th>
            <th>Total</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((b) => (
            <tr key={b.id}>
              <td>{b.booking_reference}</td>
              <td>{b.title}</td>
              <td>
                {String(b.show_date).slice(0, 10)} {String(b.show_time).slice(0, 5)}
              </td>
              <td>
                {b.seats.map((s) => `${s.row}${s.seatNumber}`).join(', ')}
              </td>
              <td>£{Number(b.total_amount).toFixed(2)}</td>
              <td>
                {b.status === 'confirmed' ? (
                  <button className="btn danger" type="button" onClick={() => cancel(b.id)}>
                    Cancel
                  </button>
                ) : (
                  <span className="meta">cancelled</span>
                )}
                {b.qr_code_path && (
                  <div>
                    <a href={b.qr_code_path} target="_blank" rel="noreferrer">
                      QR
                    </a>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
