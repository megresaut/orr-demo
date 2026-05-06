import { Routes, Route, Navigate, NavLink, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import NewProject from './pages/NewProject';
import Invoices from './pages/Invoices';
import Settings from './pages/Settings';
import OrgProfile from './pages/OrgProfile';

function Shell({ children }) {
  const { user, org, logout } = useAuth();
  const loc = useLocation();
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  return (
    <div className="app">
      <aside className="sidebar">
        <h1>ORR</h1>
        <nav>
          <NavLink to="/" end>Dashboard</NavLink>
          <NavLink to="/invoices">Invoices</NavLink>
          <NavLink to="/settings">Settings</NavLink>
          <NavLink to="/org">Company</NavLink>
        </nav>
        <div className="org">
          <div><strong>{org?.name}</strong></div>
          <div>{user?.email}</div>
          <div className="muted">Plan: {org?.plan_tier}</div>
          <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }} onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="main">{children}</main>
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
