import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function WaitlistConfirm() {
  const [params] = useSearchParams();
  const [msg, setMsg] = useState('Confirming offer…');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    const id = params.get('id');
    const token = params.get('token');
    if (!id || !token) {
      setMsg('Missing offer link.');
      return;
    }
    api
      .post(`/waitlist/${id}/confirm`, { token })
      .then((d) => {
        setOk(true);
        setMsg(`Booked ${d.booking.booking_reference}`);
      })
      .catch((e) => setMsg(e.message));
  }, [params]);

  return (
    <section className="hero">
      <h1>Waitlist offer</h1>
      <p className={ok ? 'ok' : 'meta'}>{msg}</p>
      {ok && <Link to="/bookings">View tickets</Link>}
    </section>
  );
}
