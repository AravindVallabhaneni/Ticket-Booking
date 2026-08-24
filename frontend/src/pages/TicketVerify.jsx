import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function TicketVerify() {
  const { reference } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get(`/bookings/verify/${encodeURIComponent(reference)}`)
      .then((data) => setTicket(data.ticket))
      .catch((err) => setError(err.message));
  }, [reference]);

  return (
    <section className="hero">
      <p className="kicker">Ticket verification</p>
      <h1>{ticket ? 'Valid ticket' : 'Checking ticket'}</h1>
      {error && <p className="error">{error}</p>}
      {ticket && (
        <div className="card">
          <p><strong>{ticket.title}</strong></p>
          <p className="meta">Reference: {ticket.booking_reference}</p>
          <p>{String(ticket.show_date).slice(0, 10)} at {String(ticket.show_time).slice(0, 5)}</p>
          <p>{ticket.venue_name}</p>
          <p>Seats: {ticket.seats.map((seat) => `${seat.row}${seat.seatNumber}`).join(', ')}</p>
          <p className={ticket.status === 'confirmed' ? 'ok' : 'error'}>
            Status: {ticket.status}
          </p>
        </div>
      )}
    </section>
  );
}