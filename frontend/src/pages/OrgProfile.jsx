import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';

export default function OrgProfile() {
  const { user, refresh } = useAuth();
  const [org, setOrg] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [logoBusy, setLogoBusy] = useState(false);
  const [logoMsg, setLogoMsg] = useState('');
  const [logoErr, setLogoErr] = useState('');
  const [profileMsg, setProfileMsg] = useState('');
  const [profileErr, setProfileErr] = useState('');
  const [profileBusy, setProfileBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => { api.get('/api/orgs/me').then(setOrg); }, []);

  async function onSave(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    try {
      const f = new FormData(e.target);
      const body = Object.fromEntries(f.entries());
      delete body.logo_file; // not sent here
      const r = await api.patch('/api/orgs/me', body);
      setOrg(r);
      setMsg('Saved.');
      await refresh();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function onLogoChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoMsg(''); setLogoErr(''); setLogoBusy(true);
    try {
      const fd = new FormData();
      fd.append('logo', file);
      const r = await api.upload('/api/orgs/me/logo', fd);
      setOrg(r.organization);
      setLogoMsg('Logo uploaded.');
      await refresh();
    } catch (ex) { setLogoErr(ex.message); }
    finally { setLogoBusy(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function onLogoRemove() {
    if (!window.confirm('Remove the company logo?')) return;
    setLogoMsg(''); setLogoErr(''); setLogoBusy(true);
    try {
      const r = await api.del('/api/orgs/me/logo');
      setOrg(r.organization);
      setLogoMsg('Logo removed.');
      await refresh();
    } catch (ex) { setLogoErr(ex.message); }
    finally { setLogoBusy(false); }
  }

  async function onSaveProfile(e) {
    e.preventDefault();
    setProfileMsg(''); setProfileErr(''); setProfileBusy(true);
    try {
      const f = new FormData(e.target);
      const r = await api.patch('/api/auth/me', { full_name: f.get('full_name') });
      setProfileMsg('Profile saved.');
      await refresh();
    } catch (ex) { setProfileErr(ex.message); }
    finally { setProfileBusy(false); }
  }

  if (!org) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Company profile</h1>
      <p className="muted">This information appears on the invoices you issue.</p>

      <div className="card" style={{ maxWidth: 720 }}>
        <h2>Logo</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <div style={{
            width: 120, height: 120, border: '1px dashed var(--border)', borderRadius: 8,
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafbfc', overflow: 'hidden',
          }}>
            {org.logo_url
              ? <img src={org.logo_url} alt="company logo" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} onError={e => { e.currentTarget.style.display = 'none'; }} />
              : <span className="muted" style={{ fontSize: 12 }}>No logo</span>}
          </div>
          <div style={{ flex: 1, minWidth: 240 }}>
            <p className="muted" style={{ marginTop: 0 }}>
              PNG, JPG, SVG, or WebP — up to 2 MB. Appears in the sidebar and on every invoice you issue.
            </p>
            <div className="row">
              <input ref={fileRef} type="file" accept="image/*" onChange={onLogoChange} disabled={logoBusy} />
              {org.logo_url && (
                <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={onLogoRemove} disabled={logoBusy}>Remove</button>
              )}
            </div>
            {logoMsg && <div className="success">{logoMsg}</div>}
            {logoErr && <div className="error">{logoErr}</div>}
          </div>
        </div>
      </div>

      <form onSubmit={onSave} className="card" style={{ maxWidth: 720 }}>
        <h2>Company info</h2>
        <div className="grid grid-2">
          <div className="field"><label>Company name</label><input name="name" defaultValue={org.name} required /></div>
          <div className="field"><label>Contact email</label><input name="contact_email" defaultValue={org.contact_email || ''} /></div>
          <div className="field"><label>Phone</label><input name="phone" defaultValue={org.phone || ''} /></div>
        </div>
        <div className="field"><label>Address</label><textarea name="address" rows="2" defaultValue={org.address || ''} /></div>
        {msg && <div className="success">{msg}</div>}
        {err && <div className="error">{err}</div>}
        <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      <form onSubmit={onSaveProfile} className="card" style={{ maxWidth: 720 }}>
        <h2>Your profile</h2>
        <div className="grid grid-2">
          <div className="field"><label>Your name</label><input name="full_name" defaultValue={user?.full_name || ''} placeholder="Jane Doe" /></div>
          <div className="field"><label>Email</label><input value={user?.email || ''} readOnly /></div>
        </div>
        {profileMsg && <div className="success">{profileMsg}</div>}
        {profileErr && <div className="error">{profileErr}</div>}
        <button className="btn btn-sm" disabled={profileBusy}>{profileBusy ? 'Saving…' : 'Save profile'}</button>
      </form>

      <div className="card" style={{ maxWidth: 720 }}>
        <h2>Trial / billing</h2>
        <div>Plan: <strong>{org.plan_tier}</strong></div>
        <div>Trial ends: {org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : '—'}</div>
        <div>Card on file: {org.cc_on_file ? 'yes' : 'no'} <span className="muted">(Stripe wiring is roadmap)</span></div>
      </div>
    </div>
  );
}
