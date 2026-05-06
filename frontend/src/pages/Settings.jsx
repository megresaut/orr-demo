import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const LABELS = {
  excel: 'Excel',
  asana: 'Asana',
  trello: 'Trello',
  monday: 'Monday',
  clickup: 'ClickUp',
  basecamp: 'Basecamp',
  minute7: 'Minute7',
  deputy: 'Deputy',
  qbtime: 'QB Time',
  quickbooks: 'QuickBooks',
  xero: 'Xero',
  wave: 'Wave',
  adp: 'ADP',
};

function ConnectorCard({ title, value, options, supportedNow, onChange }) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <div className="grid grid-2">
        {options.map(opt => {
          const supported = supportedNow.includes(opt);
          const active = value === opt;
          return (
            <div
              key={opt}
              className={`connector-card ${active ? 'active' : ''} ${supported ? '' : 'coming-soon'}`}
              onClick={() => supported && onChange(opt)}
              style={{ cursor: supported ? 'pointer' : 'not-allowed' }}
            >
              <h3>{LABELS[opt] || opt}</h3>
              <div className="muted">
                {active ? 'Connected' : (supported ? 'Click to use' : 'Coming soon')}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Settings() {
  const [data, setData] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api.get('/api/settings/connectors').then(setData); }, []);

  async function update(field, value) {
    setMsg('');
    const r = await api.patch('/api/settings/connectors', { [field]: value });
    setData(d => ({ ...d, ...r }));
    setMsg('Saved.');
    setTimeout(() => setMsg(''), 2000);
  }

  if (!data) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Settings · Connectors</h1>
      <p className="muted">Pick the tools your business uses for project management, time tracking, and accounting. MVP only supports Excel; other connectors arrive on the roadmap.</p>
      {msg && <div className="success">{msg}</div>}

      <ConnectorCard
        title="Project management"
        value={data.pm_connector}
        options={data.catalogs.project_management}
        supportedNow={data.supported_now}
        onChange={v => update('pm_connector', v)}
      />
      <ConnectorCard
        title="Time / resource tracking"
        value={data.time_connector}
        options={data.catalogs.time_tracking}
        supportedNow={data.supported_now}
        onChange={v => update('time_connector', v)}
      />
      <ConnectorCard
        title="Accounting"
        value={data.acct_connector}
        options={data.catalogs.accounting}
        supportedNow={data.supported_now}
        onChange={v => update('acct_connector', v)}
      />
    </div>
  );
}
