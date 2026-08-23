import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Organiser() {
  const [events, setEvents] = useState([]);
  const [venues, setVenues] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ title: '', type: 'movie', description: '' });
  const [show, setShow] = useState({ eventId: '', venueId: '', date: '', time: '19:30' });
  const [prices, setPrices] = useState({});
  const [msg, setMsg] = useState('');

  async function load() {
    const [e, v] = await Promise.all([api.get('/organiser/events'), api.get('/venues')]);
    setEvents(e.events);
    setVenues(v.venues);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function createEvent(e) {
    e.preventDefault();
    await api.post('/events', form);
    setForm({ title: '', type: 'movie', description: '' });
    await load();
  }

  async function createShow(e) {
    e.preventDefault();
    const venue = venues.find((v) => v.id === show.venueId);
    const cats = venue?.categories || [];
    await api.post(`/events/${show.eventId}/shows`, {
      venueId: show.venueId,
      date: show.date,
      time: show.time,
      pricing: cats.map((c) => ({
        category: c.name,
        price: Number(prices[c.name] ?? c.basePrice ?? 0),
      })),
    });
    setMsg('Show created and seat map initialized.');
    await load();
  }

  async function viewSummary(id) {
    setSummary(await api.get(`/organiser/events/${id}/summary`));
  }

  return (
    <section className="hero">
      <p className="kicker">Organiser</p>
      <h1>Listings &amp; revenue</h1>
      {msg && <p className="ok">{msg}</p>}
      <div className="checkout">
        <form className="card form" onSubmit={createEvent}>
          <h3>New event</h3>
          <input placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="movie">Movie</option>
            <option value="concert">Concert</option>
          </select>
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <button className="btn" type="submit">
            Create event
          </button>
        </form>
        <form className="card form" onSubmit={createShow}>
          <h3>New show</h3>
          <select value={show.eventId} onChange={(e) => setShow({ ...show, eventId: e.target.value })}>
            <option value="">Event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
          <select
            value={show.venueId}
            onChange={(e) => {
              const venueId = e.target.value;
              setShow({ ...show, venueId });
              const venue = venues.find((v) => v.id === venueId);
              const next = {};
              for (const c of venue?.categories || []) next[c.name] = c.basePrice;
              setPrices(next);
            }}
          >
            <option value="">Venue</option>
            {venues.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
          <input type="date" value={show.date} onChange={(e) => setShow({ ...show, date: e.target.value })} />
          <input type="time" value={show.time} onChange={(e) => setShow({ ...show, time: e.target.value })} />
          {Object.keys(prices).map((cat) => (
            <label key={cat}>
              {cat} £
              <input
                type="number"
                value={prices[cat]}
                onChange={(e) => setPrices({ ...prices, [cat]: e.target.value })}
              />
            </label>
          ))}
          <button className="btn" type="submit">
            Add show
          </button>
        </form>
      </div>
      <h2>Your events</h2>
      <div className="grid">
        {events.map((ev) => (
          <article className="card" key={ev.id}>
            <p className="kicker">{ev.type}</p>
            <h3>{ev.title}</h3>
            <button className="btn secondary" type="button" onClick={() => viewSummary(ev.id)}>
              Summary
            </button>
          </article>
        ))}
      </div>
      {summary && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>
            {summary.event.title} — £{Number(summary.totals.revenue).toFixed(2)}
          </h3>
          <table className="table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Venue</th>
                <th>Sold</th>
                <th>Bookings</th>
                <th>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {summary.shows.map((s) => (
                <tr key={s.id}>
                  <td>
                    {String(s.show_date).slice(0, 10)} {String(s.show_time).slice(0, 5)}
                  </td>
                  <td>{s.venue_name}</td>
                  <td>
                    {s.seats_sold}/{s.seats_total}
                  </td>
                  <td>{s.booking_count}</td>
                  <td>£{Number(s.revenue).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
