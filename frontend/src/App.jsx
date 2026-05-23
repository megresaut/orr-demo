import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, NavLink, Link, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import NewProject from './pages/NewProject';
import EditProject from './pages/EditProject';
import DeletedProjects from './pages/DeletedProjects';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';
import OrgProfile from './pages/OrgProfile';
import platformLogo from './assets/operra-logo.jpg';

const APP_VERSION = 'v1.0.1';

function UserMenu() {
  const { user, org, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    function onDoc(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  const initial = (user?.full_name || user?.email || '?').trim().charAt(0).toUpperCase();
  return (
    <div className="user-menu" ref={ref}>
      <button
        type="button"
        className="user-avatar"
        onClick={() => setOpen(v => !v)}
        title={user?.email || ''}
        aria-label="Account menu"
      >
        {initial}
      </button>
      {open && (
        <div className="user-menu-pop">
          <div className="user-menu-head">
            <div className="user-menu-name">{user?.full_name || user?.email}</div>
            {user?.full_name && <div className="muted">{user.email}</div>}
            {org?.name && <div className="muted">{org.name}</div>}
          </div>
          <Link to="/settings" className="user-menu-item" onClick={() => setOpen(false)}>Settings</Link>
          <Link to="/org" className="user-menu-item" onClick={() => setOpen(false)}>Company profile</Link>
          <button type="button" className="user-menu-item" onClick={() => { setOpen(false); logout(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

function Shell({ children }) {
  const { user, org, logout } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <img src={platformLogo} alt="OpeRRa" className="brand-logo" />
          <span className="brand-name">OpeRRa</span>
        </div>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/invoices">Invoices</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/org">Company</NavLink>
          <NavLink to="/projects/deleted">Deleted projects</NavLink>
        </nav>
        <div className="org">
          {org?.logo_url && (
            <img
              src={org.logo_url}
              alt={`${org.name} logo`}
              className="org-logo"
              onError={e => { e.currentTarget.style.display = 'none'; }}
            />
          )}
          <div><strong>{org?.name}</strong></div>
          <div>{user?.email}</div>
          <div className="muted">Plan: {org?.plan_tier}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">
        <header className="topbar">
          <UserMenu />
        </header>
        {children}
        <footer className="app-footer">© {new Date().getFullYear()} Integr8Works · {APP_VERSION}</footer>
      </main>
    </div>
  );
}

function Loader() { return <div className="center">Loading…</div>; }

function Inner() {
  const { loading } = useAuth();
  if (loading) return <Loader />;
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/" element={<Shell><Dashboard /></Shell>} />
      <Route path="/projects" element={<Navigate to="/" replace />} />
      <Route path="/projects/new" element={<Shell><NewProject /></Shell>} />
      <Route path="/projects/deleted" element={<Shell><DeletedProjects /></Shell>} />
      <Route path="/projects/:id/edit" element={<Shell><EditProject /></Shell>} />
      <Route path="/projects/:id" element={<Shell><ProjectDetail /></Shell>} />
      <Route path="/invoices" element={<Shell><Invoices /></Shell>} />
      <Route path="/settings" element={<Shell><Settings /></Shell>} />
      <Route path="/org" element={<Shell><OrgProfile /></Shell>} />
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
}

export default function App() {
  return <AuthProvider><Inner /></AuthProvider>;
}
