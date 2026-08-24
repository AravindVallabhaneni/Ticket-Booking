import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Home from './pages/Home.jsx';
import EventDetail from './pages/EventDetail.jsx';
import SeatMap from './pages/SeatMap.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import Verify from './pages/Verify.jsx';
import Bookings from './pages/Bookings.jsx';
import Waitlist from './pages/Waitlist.jsx';
import WaitlistConfirm from './pages/WaitlistConfirm.jsx';
import Organiser from './pages/Organiser.jsx';
import Admin from './pages/Admin.jsx';
import TicketVerify from './pages/TicketVerify.jsx';

function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="shell nav">
      <Link className="brand" to="/">
        Un<span>thinkable</span>
      </Link>
      <nav className="nav-links">
        <Link to="/">What’s on</Link>
        {user?.role === 'customer' && <Link to="/bookings">My tickets</Link>}
        {user?.role === 'customer' && <Link to="/waitlist">Waitlist</Link>}
        {(user?.role === 'organiser' || user?.role === 'admin') && <Link to="/organiser">Organiser</Link>}
        {user?.role === 'admin' && <Link to="/admin">Admin</Link>}
        {user ? (
          <>
            <span className="meta">{user.name}</span>
            <button className="link" type="button" onClick={logout}>
              Sign out
            </button>
          </>
        ) : (
          <>
            <Link to="/login">Sign in</Link>
            <Link className="btn" to="/register">
              Join
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}

function Guard({ roles, children }) {
  const { user } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <>
      <Nav />
      <main className="shell" style={{ paddingBottom: 80 }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/events/:id" element={<EventDetail />} />
          <Route path="/shows/:id" element={<SeatMap />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<Verify />} />
          <Route path="/tickets/:reference" element={<TicketVerify />} />
          <Route
            path="/bookings"
            element={
              <Guard>
                <Bookings />
              </Guard>
            }
          />
          <Route
            path="/waitlist"
            element={
              <Guard>
                <Waitlist />
              </Guard>
            }
          />
          <Route
            path="/waitlist/confirm"
            element={
              <Guard>
                <WaitlistConfirm />
              </Guard>
            }
          />
          <Route
            path="/organiser"
            element={
              <Guard roles={['organiser', 'admin']}>
                <Organiser />
              </Guard>
            }
          />
          <Route
            path="/admin"
            element={
              <Guard roles={['admin']}>
                <Admin />
              </Guard>
            }
          />
        </Routes>
      </main>
    </>
  );
}
