import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';

const TEXT_FIELDS = [
  'name', 'code', 'location', 'description',
  'client_name', 'client_contact', 'client_email', 'client_phone', 'client_address',
  'invoice_seq',
];
const DATE_FIELDS = ['start_date', 'end_date'];
const NUMBER_FIELDS = ['contract_amount', 'overhead_multiplier', 'profit_pct'];
const BOOLEAN_FIELDS = ['is_lumpsum'];

function isoSlice(s) {
  // For date inputs: backend may return a Date string or ISO timestamp;
  // <input type="date"> needs YYYY-MM-DD.
  if (!s) return '';
  const str = typeof s === 'string' ? s : (s instanceof Date ? s.toISOString() : String(s));
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : '';
}

export default function EditProject() {
  const { id } = useParams();
  const nav = useNavigate();
  const [form, setForm] = useState(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [loadErr, setLoadErr] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const p = await api.get(`/api/projects/${id}`);
        const hydrated = {};
        for (const k of TEXT_FIELDS) hydrated[k] = p[k] ?? '';
        for (const k of DATE_FIELDS) hydrated[k] = isoSlice(p[k]);
        for (const k of NUMBER_FIELDS) hydrated[k] = p[k] != null ? String(p[k]) : '';
        for (const k of BOOLEAN_FIELDS) hydrated[k] = !!p[k];
        setForm(hydrated);
      } catch (e) { setLoadErr(e.message); }
    })();
  }, [id]);

  function setField(k, v) { setForm(prev => ({ ...prev, [k]: v })); }

  async function onSubmit(e) {
    e.preventDefault();
    setErr(''); setMsg(''); setBusy(true);
    try {
      const body = {};
      for (const k of TEXT_FIELDS) body[k] = form[k] || null;
      for (const k of DATE_FIELDS) body[k] = form[k] || null;
      for (const k of NUMBER_FIELDS) {
        const n = Number(form[k]);
        body[k] = Number.isFinite(n) ? n : null;
      }
      for (const k of BOOLEAN_FIELDS) body[k] = !!form[k];
      // Defensive: server enforces the same, but send neutral values when lumpsum
      // so the optimistic local state matches what we'll get back.
      if (body.is_lumpsum) { body.overhead_multiplier = 1; body.profit_pct = 0; }
      await api.patch(`/api/projects/${id}`, body);
      setMsg('Saved.');
      nav(`/projects/${id}`);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  if (loadErr) return <div className="card error">{loadErr}</div>;
  if (!form) return <div>Loading…</div>;

  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 className="page-title">Edit project</h1>
        <Link to={`/projects/${id}`} className="btn btn-ghost btn-sm">Cancel</Link>
      </div>

      <form onSubmit={onSubmit} className="card" style={{ maxWidth: 720 }}>
        <h3 style={{ margin: '0 0 10px' }}>Project</h3>
        <div className="grid grid-2">
          <div className="field"><label>Project name *</label><input value={form.name} onChange={e => setField('name', e.target.value)} required /></div>
          <div className="field"><label>Project code</label><input value={form.code} onChange={e => setField('code', e.target.value)} placeholder="DDXXX-MM-YYYY" /></div>
          <div className="field"><label>Location</label><input value={form.location} onChange={e => setField('location', e.target.value)} /></div>
          <div className="field"><label>Start date</label><input type="date" value={form.start_date} onChange={e => setField('start_date', e.target.value)} /></div>
          <div className="field"><label>End date</label><input type="date" value={form.end_date} onChange={e => setField('end_date', e.target.value)} /></div>
        </div>
        <div className="field"><label>Description</label><textarea rows="2" value={form.description} onChange={e => setField('description', e.target.value)} /></div>

        <h3 style={{ margin: '18px 0 10px' }}>Client / Bill To</h3>
        <p className="muted" style={{ marginTop: 0 }}>Used as the &ldquo;Bill To&rdquo; block on generated invoices.</p>
        <div className="grid grid-2">
          <div className="field"><label>Client name</label><input value={form.client_name} onChange={e => setField('client_name', e.target.value)} placeholder="Company name" /></div>
          <div className="field"><label>Contact person</label><input value={form.client_contact} onChange={e => setField('client_contact', e.target.value)} placeholder="e.g. Jane Doe, AP Lead" /></div>
          <div className="field"><label>Client email</label><input type="email" value={form.client_email} onChange={e => setField('client_email', e.target.value)} /></div>
          <div className="field"><label>Client phone</label><input value={form.client_phone} onChange={e => setField('client_phone', e.target.value)} /></div>
        </div>
        <div className="field"><label>Client address</label><textarea rows="2" value={form.client_address} onChange={e => setField('client_address', e.target.value)} placeholder="Street, City, State ZIP" /></div>

        <h3 style={{ margin: '18px 0 10px' }}>Billing</h3>
        <label className="row" style={{ alignItems: 'center', gap: 8, marginBottom: 10, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={!!form.is_lumpsum}
            onChange={e => setField('is_lumpsum', e.target.checked)}
          />
          <span>Lumpsum project <span className="muted" style={{ fontWeight: 400 }}>(overhead &amp; profit are baked into the contract)</span></span>
        </label>
        <div className="grid grid-2">
          <div className="field">
            <label>Contract amount</label>
            <div className="input-prefix"><span>$</span><input type="number" step="0.01" min="0" value={form.contract_amount} onChange={e => setField('contract_amount', e.target.value)} placeholder="0.00" /></div>
          </div>
          <div className="field">
            <label>Overhead multiplier</label>
            <input
              type="number"
              step="0.01"
              value={form.is_lumpsum ? '1' : form.overhead_multiplier}
              onChange={e => setField('overhead_multiplier', e.target.value)}
              disabled={!!form.is_lumpsum}
            />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>
              {form.is_lumpsum
                ? 'Locked for lumpsum projects.'
                : 'e.g. 1.66 adds 66% overhead on top of subtotal. 1.00 = no overhead.'}
            </div>
          </div>
          <div className="field">
            <label>Profit %</label>
            <input
              type="number"
              step="0.1"
              value={form.is_lumpsum ? '0' : form.profit_pct}
              onChange={e => setField('profit_pct', e.target.value)}
              disabled={!!form.is_lumpsum}
            />
            {form.is_lumpsum && <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Locked for lumpsum projects.</div>}
          </div>
          <div className="field"><label>Invoice sequence</label><input value={form.invoice_seq} onChange={e => setField('invoice_seq', e.target.value)} placeholder="INV_01" /></div>
        </div>
        {err && <div className="error">{err}</div>}
        {msg && <div className="success">{msg}</div>}
        <div className="row" style={{ marginTop: 12, gap: 8 }}>
          <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
          <Link to={`/projects/${id}`} className="btn btn-ghost">Cancel</Link>
        </div>
      </form>
    </div>
  );
}
