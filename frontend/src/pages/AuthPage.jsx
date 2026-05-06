import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';

export default function AuthPage() {
  const { login, user } = useAuth();
  const nav = useNavigate();
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) { nav('/'); return null; }

  async function onLogin(e) {
    e.preventDefault();
    setErr(''); setLoading(true);
    const f = new FormData(e.target);
    try {
      await login(f.get('email'), f.get('password'));
      nav('/');
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="center">
      <div className="card auth-card">
        <h1 style={{ color: 'var(--teal)', marginTop: 0 }}>ORR</h1>
        <p className="muted" style={{ marginTop: -8 }}>Operation · Resource · Revenue</p>

        <h2 style={{ marginTop: 24, marginBottom: 12 }}>Sign in</h2>
        <form onSubmit={onLogin}>
          <div className="field"><label>Email</label><input name="email" type="email" required /></div>
          <div className="field"><label>Password</label><input name="password" type="password" required /></div>
          {err && <div className="error">{err}</div>}
          <button className="btn" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
        </form>
      </div>
    </div>
  );
}
