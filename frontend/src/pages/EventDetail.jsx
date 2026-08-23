import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api/client.js';

export default function EventDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/events/${id}`).then(setData).catch((e) => setError(e.message));
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!data) return <p>Loading…</p>;

  return (
    <section className="hero">
      <p className="kicker">{data.event.type}</p>
      <h1>{data.event.title}</h1>
      <p className="meta">Presented by {data.event.organiser_name}</p>
      <p>{data.event.description}</p>
      <div className="grid" style={{ marginTop: 28 }}>
        {data.shows.map((s) => (
          <article className="card" key={s.id}>
            <h3>
              {String(s.show_date).slice(0, 10)} · {String(s.show_time).slice(0, 5)}
            </h3>
            <p className="meta">{s.venue_name}</p>
            <Link className="btn" to={`/shows/${s.id}`}>
              Choose seats
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
