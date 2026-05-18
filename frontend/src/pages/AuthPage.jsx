import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import platformLogo from '../assets/operra-logo.svg';

export default function AuthPage() {
  const { login, signup, user } = useAuth();
  const nav = useNavigate();
  const [params, setParams] = useSearchParams();
  const resetToken = params.get('reset');
  const [tab, setTab] = useState(resetToken ? 'reset' : 'login'); // 'login' | 'signup' | 'forgot' | 'reset'
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (resetToken && tab !== 'reset') setTab('reset');
  }, [resetToken]); // eslint-disable-line react-hooks/exhaustive-deps

  if (user) { nav('/'); return null; }

  function switchTab(t) {
    setTab(t); setErr(''); setMsg('');
  }

  async function onLogin(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setLoading(true);
    const f = new FormData(e.target);
    try {
      await login(f.get('email'), f.get('password'));
      nav('/');
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  async function onSignup(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setLoading(true);
    const f = new FormData(e.target);
    try {
      await signup({
        companyName: f.get('companyName'),
        fullName: f.get('fullName'),
        email: f.get('email'),
        password: f.get('password'),
      });
      nav('/');
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  async function onReset(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setLoading(true);
    const f = new FormData(e.target);
    const password = f.get('password');
    const confirm = f.get('confirm');
    if (password !== confirm) {
      setErr('Passwords do not match'); setLoading(false); return;
    }
    try {
      const r = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Reset failed');
      setMsg('Password reset — sign in with your new password.');
      setParams({});
      setTab('login');
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  async function onForgot(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setLoading(true);
    const f = new FormData(e.target);
    try {
      const r = await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: f.get('email') }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || 'Reset failed');
      setMsg(
        data.devResetUrl
          ? `Reset link (SMTP not configured): ${data.devResetUrl}`
          : 'If an account exists with that email, a reset link has been sent.'
      );
    } catch (ex) { setErr(ex.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="center">
      <div className="card auth-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
          <img src={platformLogo} alt="OpeRRa" style={{ width: 44, height: 44 }} />
          <h1 style={{ color: 'var(--teal)', margin: 0 }}>OpeRRa</h1>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>Operation · Resource · Revenue</p>

        <div className="auth-tabs">
          <button className={tab === 'login' ? 'active' : ''} onClick={() => switchTab('login')} type="button">Sign in</button>
          <button className={tab === 'signup' ? 'active' : ''} onClick={() => switchTab('signup')} type="button">Create account</button>
        </div>

        {tab === 'login' && (
          <form onSubmit={onLogin}>
            <div className="field"><label>Email</label><input name="email" type="email" required autoFocus /></div>
            <div className="field"><label>Password</label><input name="password" type="password" required /></div>
            {err && <div className="error">{err}</div>}
            {msg && <div className="success">{msg}</div>}
            <button className="btn" disabled={loading}>{loading ? 'Signing in…' : 'Sign in'}</button>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a href="#forgot" onClick={e => { e.preventDefault(); switchTab('forgot'); }}>Forgot password?</a>
            </div>
          </form>
        )}

        {tab === 'signup' && (
          <form onSubmit={onSignup}>
            <div className="field"><label>Company name</label><input name="companyName" required autoFocus placeholder="Acme Engineering Inc" /></div>
            <div className="field"><label>Your name</label><input name="fullName" placeholder="Jane Doe" /></div>
            <div className="field"><label>Work email</label><input name="email" type="email" required placeholder="you@acme.com" /></div>
            <div className="field"><label>Password</label><input name="password" type="password" minLength="8" required /></div>
            {err && <div className="error">{err}</div>}
            <button className="btn" disabled={loading}>{loading ? 'Creating…' : 'Start 7-day trial'}</button>
            <p className="muted" style={{ marginTop: 10, fontSize: 12 }}>By creating an account you start a 7-day trial. No card required.</p>
          </form>
        )}

        {tab === 'forgot' && (
          <form onSubmit={onForgot}>
            <p className="muted" style={{ marginTop: 0 }}>Enter your email — we'll send a reset link.</p>
            <div className="field"><label>Email</label><input name="email" type="email" required autoFocus /></div>
            {err && <div className="error">{err}</div>}
            {msg && <div className="success" style={{ wordBreak: 'break-all' }}>{msg}</div>}
            <button className="btn" disabled={loading}>{loading ? 'Sending…' : 'Send reset link'}</button>
            <div style={{ marginTop: 12, textAlign: 'center' }}>
              <a href="#login" onClick={e => { e.preventDefault(); switchTab('login'); }}>← Back to sign in</a>
            </div>
          </form>
        )}

        {tab === 'reset' && (
          <form onSubmit={onReset}>
            <p className="muted" style={{ marginTop: 0 }}>Choose a new password (at least 8 characters).</p>
            <div className="field"><label>New password</label><input name="password" type="password" minLength="8" required autoFocus /></div>
            <div className="field"><label>Confirm password</label><input name="confirm" type="password" minLength="8" required /></div>
            {err && <div className="error">{err}</div>}
            {msg && <div className="success">{msg}</div>}
            <button className="btn" disabled={loading}>{loading ? 'Resetting…' : 'Reset password'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
