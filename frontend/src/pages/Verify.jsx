import { useEffect, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import { useAuth } from '../context/AuthContext.jsx';

export default function Verify() {
  const [params] = useSearchParams();
  const location = useLocation();
  const { user, refreshUser } = useAuth();
  const [status, setStatus] = useState('idle');
  const [msg, setMsg] = useState(
    location.state?.registeredEmail
      ? `Account created for ${location.state.registeredEmail}. Check your inbox for the verification link.`
      : '',
  );
  const token = params.get('token');

  useEffect(() => {
    if (!token) return;
    api
      .get(`/auth/verify?token=${encodeURIComponent(token)}`)
      .then((d) => {
        setStatus('ok');
        if (user) refreshUser({ ...user, isVerified: true, is_verified: true });
        setMsg(`Welcome, ${d.user.name}. Your email is verified.`);
      })
      .catch((e) => {
        setStatus('err');
        setMsg(e.message);
      });
  }, [token]);

  async function resend() {
    const email = user?.email;
    if (!email) {
      setMsg('Sign in, then resend from this page.');
      return;
    }
    try {
      await api.post('/auth/resend-verification', { email });
      setMsg('If that inbox exists, a new link is on its way (or logged in the API console).');
    } catch (e) {
      setMsg(e.message);
    }
  }

  return (
    <section className="hero">
      <p className="kicker">Email</p>
      <h1>Verify your account</h1>
      <p className="meta">
        Unverified accounts can sign in, but cannot hold seats, book, or join waitlists.
      </p>
      {msg && <p className={status === 'err' ? 'error' : 'ok'}>{msg}</p>}
      {!token && (
        <button className="btn" type="button" onClick={resend}>
          Resend verification
        </button>
      )}
    </section>
  );
}
