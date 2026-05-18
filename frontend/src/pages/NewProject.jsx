import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export default function NewProject() {
  const nav = useNavigate();
  const [tab, setTab] = useState('upload');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function onUpload(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const f = new FormData(e.target);
    try {
      const data = await api.upload('/api/upload/onboarding', f);
      nav(`/projects/${data.project.id}`);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function onManual(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    const f = new FormData(e.target);
    try {
      const body = Object.fromEntries(f.entries());
      ['contract_amount', 'allowance', 'overhead_multiplier', 'profit_pct'].forEach(k => {
        if (body[k]) body[k] = Number(body[k]);
      });
      const proj = await api.post('/api/projects', body);
      nav(`/projects/${proj.id}`);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div>
      <h1 className="page-title">New project</h1>
      <div className="auth-tabs" style={{ maxWidth: 480 }}>
        <button className={tab === 'upload' ? 'active' : ''} onClick={() => setTab('upload')}>Upload Excel</button>
        <button className={tab === 'manual' ? 'active' : ''} onClick={() => setTab('manual')}>Enter manually</button>
      </div>

      {tab === 'upload' ? (
        <form onSubmit={onUpload} className="card" style={{ maxWidth: 600 }}>
          <p className="muted">
            Upload the OpeRRa360 onboarding workbook. Project info, client info, timeline, contract amount, and labor rates will be extracted automatically.
          </p>
          <div className="field"><label>Workbook (.xlsx)</label><input type="file" name="file" accept=".xlsx" required /></div>
          {err && <div className="error">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Importing…' : 'Import project'}</button>
        </form>
      ) : (
        <form onSubmit={onManual} className="card" style={{ maxWidth: 720 }}>
          <div className="grid grid-2">
            <div className="field"><label>Project name</label><input name="name" required /></div>
            <div className="field"><label>Project code</label><input name="code" placeholder="DDXXX-MM-YYYY" /></div>
            <div className="field"><label>Location</label><input name="location" /></div>
            <div className="field"><label>Client name</label><input name="client_name" /></div>
            <div className="field"><label>Client email</label><input name="client_email" type="email" /></div>
            <div className="field"><label>Client phone</label><input name="client_phone" /></div>
            <div className="field"><label>Start date</label><input name="start_date" type="date" /></div>
            <div className="field"><label>End date</label><input name="end_date" type="date" /></div>
            <div className="field">
              <label>Contract amount</label>
              <div className="input-prefix"><span>$</span><input name="contract_amount" type="number" step="0.01" min="0" placeholder="0.00" /></div>
            </div>
            <div className="field"><label>Overhead multiplier</label><input name="overhead_multiplier" type="number" step="0.01" defaultValue="1.66" /></div>
            <div className="field"><label>Profit %</label><input name="profit_pct" type="number" step="0.1" defaultValue="10" /></div>
            <div className="field"><label>Invoice sequence</label><input name="invoice_seq" placeholder="INV_01" /></div>
          </div>
          <div className="field"><label>Description</label><textarea name="description" rows="2" /></div>
          {err && <div className="error">{err}</div>}
          <button className="btn" disabled={busy}>{busy ? 'Creating…' : 'Create project'}</button>
        </form>
      )}
    </div>
  );
}
