import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client.js';

export default function Home() {
  const [listings, setListings] = useState([]);
  const [venues, setVenues] = useState([]);
  const [filters, setFilters] = useState({ type: '', date: '', venueId: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/venues').then((d) => setVenues(d.venues)).catch(() => {});
  }, []);

  useEffect(() => {
    const q = new URLSearchParams();
    if (filters.type) q.set('type', filters.type);
    if (filters.date) q.set('date', filters.date);
    if (filters.venueId) q.set('venueId', filters.venueId);
    const qs = q.toString();
    api
      .get(`/events${qs ? `?${qs}` : ''}`)
      .then((d) => setListings(d.listings))
      .catch((e) => setError(e.message));
  }, [filters]);

  return (
    <>
      <section className="hero">
        <p className="kicker">Cinema &amp; live music</p>
        <h1>Hold a seat. The room updates live.</h1>
        <p className="meta">Ten-minute holds, QR tickets, and a waitlist when a category sells out.</p>
      </section>
      <div className="filters">
        <select value={filters.type} onChange={(e) => setFilters({ ...filters, type: e.target.value })}>
          <option value="">All types</option>
          <option value="movie">Movies</option>
          <option value="concert">Concerts</option>
        </select>
        <input type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
        <select value={filters.venueId} onChange={(e) => setFilters({ ...filters, venueId: e.target.value })}>
          <option value="">All venues</option>
          {venues.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="grid">
        {listings.map((item) => (
          <article className="card" key={item.show_id}>
            <p className="kicker">{item.type}</p>
            <h3>{item.title}</h3>
            <p className="meta">
              {String(item.show_date).slice(0, 10)} · {String(item.show_time).slice(0, 5)}
              <br />
              {item.venue_name}
            </p>
            <p>From £{Number(item.from_price).toFixed(2)}</p>
            <Link className="btn" to={`/shows/${item.show_id}`}>
              Seat map
            </Link>
            <div style={{ marginTop: 8 }}>
              <Link to={`/events/${item.event_id}`}>Event details</Link>
            </div>
          </article>
        ))}
      </div>
      {!listings.length && <p className="meta">No listings match those filters.</p>}
    </>
  );
}
