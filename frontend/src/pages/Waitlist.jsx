import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

export default function Waitlist() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    api.get('/waitlist/me').then((d) => setRows(d.waitlist));
  }, []);

  return (
    <section className="hero">
      <p className="kicker">Queue</p>
      <h1>Your waitlists</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Event</th>
            <th>Category</th>
            <th>Position</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.id}>
              <td>
                {w.title}
                <div className="meta">
                  {String(w.show_date).slice(0, 10)} {String(w.show_time).slice(0, 5)}
                </div>
              </td>
              <td>{w.category}</td>
              <td>{w.position}</td>
              <td>{w.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
