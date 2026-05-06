import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function OrgProfile() {
  const [org, setOrg] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get('/api/orgs/me').then(setOrg); }, []);

  async function onSave(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    try {
      const f = new FormData(e.target);
      const r = await api.patch('/api/orgs/me', Object.fromEntries(f.entries()));
      setOrg(r);
      setMsg('Saved.');
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  if (!org) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Company profile</h1>
      <p className="muted">This information appears on the invoices you issue.</p>

      <form onSubmit={onSave} className="card" style={{ maxWidth: 720 }}>
        <div className="grid grid-2">
          <div className="field"><label>Company name</label><input name="name" defaultValue={org.name} required /></div>
          <div className="field"><label>Contact email</label><input name="contact_email" defaultValue={org.contact_email || ''} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={org.phone || ''} /></div>
          <div className="field"><label>Logo URL</label><input name="logo_url" defaultValue={org.logo_url || ''} /></div>
        </div>
        <div className="field"><label>Address</label><textarea name="address" rows="2" defaultValue={org.address || ''} /></div>
        {msg && <div className="success">{msg}</div>}
        {err && <div className="error">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Trial / billing</h2>
        <div>Plan: <strong>{org.plan_tier}</strong></div>
        <div>Trial ends: {org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : '—'}</div>
        <div>Card on file: {org.cc_on_file ? 'yes' : 'no'} <span className="muted">(Stripe wiring is roadmap)</span></div>
      </div>
    </div>
  );
}
