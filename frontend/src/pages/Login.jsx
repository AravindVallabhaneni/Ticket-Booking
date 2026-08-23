import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    try {
      const data = await login(email, password);
      const dest =
        loc.state?.from ||
        (data.user.role === 'admin' ? '/admin' : data.user.role === 'organiser' ? '/organiser' : '/');
      nav(dest);
    } catch (e) {
      setErr(e.message);
    }
  }

  return (
    <section className="hero">
      <p className="kicker">Account</p>
      <h1>Sign in</h1>
      <form className="form" onSubmit={onSubmit}>
        <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {err && <p className="error">{err}</p>}
        <button className="btn" type="submit">
          Continue
        </button>
        <p className="meta">
          New here? <Link to="/register">Create an account</Link>
        </p>
      </form>
    </section>
  );
}
