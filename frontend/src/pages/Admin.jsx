import { useEffect, useState } from 'react';
import { api } from '../api/client.js';

const ROWS = 'ABCDEFGH'.split('');

export default function Admin() {
  const [venues, setVenues] = useState([]);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [selected, setSelected] = useState(null);
  const [premiumUntil, setPremiumUntil] = useState('B');
  const [cols, setCols] = useState(12);
  const [msg, setMsg] = useState('');

  async function load() {
    const d = await api.get('/admin/venues');
    setVenues(d.venues);
  }

  useEffect(() => {
    load().catch((e) => setMsg(e.message));
  }, []);

  async function createVenue(e) {
    e.preventDefault();
    await api.post('/admin/venues', { name, address });
    setName('');
    setAddress('');
    await load();
  }

  async function buildSeats() {
    const seats = [];
    for (const row of ROWS) {
      const category = row <= premiumUntil ? 'Premium' : 'Standard';
      for (let n = 1; n <= Number(cols); n += 1) {
        seats.push({ section: 'Main', row, seatNumber: n, category });
      }
    }
    await api.post(`/admin/venues/${selected}/seats`, {
      categories: [
        { name: 'Premium', basePrice: 28 },
        { name: 'Standard', basePrice: 16 },
      ],
      seats,
    });
    setMsg(`Laid out ${seats.length} seats.`);
    await load();
  }

  return (
    <section className="hero">
      <p className="kicker">Admin</p>
      <h1>Venues &amp; seat layouts</h1>
      {msg && <p className="ok">{msg}</p>}
      <form className="form card" onSubmit={createVenue}>
        <h3>New venue</h3>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        <button className="btn" type="submit">
          Create venue
        </button>
      </form>
      <div className="grid" style={{ marginTop: 24 }}>
        {venues.map((v) => (
          <article className="card" key={v.id}>
            <h3>{v.name}</h3>
            <p className="meta">{v.address}</p>
            <p>{v.seat_count} seats</p>
            <button className="btn secondary" type="button" onClick={() => setSelected(v.id)}>
              Layout this venue
            </button>
          </article>
        ))}
      </div>
      {selected && (
        <div className="card" style={{ marginTop: 24 }}>
          <h3>Seat layout builder</h3>
          <p className="meta">8 rows (A–H). Rows up to the chosen letter are Premium.</p>
          <div className="filters">
            <label>
              Premium through
              <select value={premiumUntil} onChange={(e) => setPremiumUntil(e.target.value)}>
                {ROWS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
            <label>
              Seats per row
              <input type="number" min={4} max={20} value={cols} onChange={(e) => setCols(e.target.value)} />
            </label>
          </div>
          <button className="btn" type="button" onClick={buildSeats}>
            Save layout
          </button>
        </div>
      )}
    </section>
  );
}
