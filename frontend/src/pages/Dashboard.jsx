import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

function fmt(n) { return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState(null);
  useEffect(() => {
    api.get('/api/analytics/portfolio').then(setData).catch(() => {});
    api.get('/api/invoices/dunning').then(d => setBanner(d.banner)).catch(() => {});
  }, []);
  if (!data) return <div>Loading…</div>;
  const { projects, totals } = data;

  return (
    <div>
      <h1 className="page-title">Portfolio</h1>
      {banner && (
        <div className="banner">
          <strong>Payment reminder.</strong> You have {banner.unpaid_count} unpaid invoice(s) totaling {fmt(banner.unpaid_total)}.
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="kpi"><div className="l">Active projects</div><div className="v">{projects.length}</div></div>
        <div className="kpi"><div className="l">Contract value</div><div className="v">{fmt(totals.contract)}</div></div>
        <div className="kpi"><div className="l">Delivered</div><div className="v">{fmt(totals.delivered)}</div></div>
        <div className="kpi"><div className="l">Unpaid</div><div className="v">{fmt(totals.unpaid)}</div></div>
      </div>

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <h2 style={{ margin: 0 }}>Projects</h2>
        <Link to="/projects/new" className="btn btn-sm">+ New project</Link>
      </div>
      {projects.length ? (
        <div className="grid grid-3">
          {projects.map(p => {
            const contract = Number(p.contract_amount || 0);
            const delivered = Number(p.total_services_to_date || 0);
            const pct = contract > 0 ? Math.min(100, Math.round((delivered / contract) * 100)) : 0;
            return (
              <Link
                to={`/projects/${p.id}`}
                key={p.id}
                className="card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'flex', flexDirection: 'column', gap: 10 }}
              >
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <span className="pill">{p.code || 'No code'}</span>
                  {Number(p.unpaid) > 0
                    ? <span className="pill red">Unpaid {fmt(p.unpaid)}</span>
                    : <span className="pill green">Up to date</span>}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{p.name}</div>
                </div>
                <div className="grid grid-2" style={{ gap: 8 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Hours</div>
                    <div style={{ fontWeight: 600 }}>{Number(p.hours || 0).toFixed(1)}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Contract</div>
                    <div style={{ fontWeight: 600 }}>{fmt(contract)}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Delivered</div>
                    <div style={{ fontWeight: 600 }}>{fmt(delivered)}</div>
                  </div>
                  <div>
                    <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase' }}>Progress</div>
                    <div style={{ fontWeight: 600 }}>{pct}%</div>
                  </div>
                </div>
                <div style={{ height: 6, background: 'var(--bg)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: 'var(--teal)' }} />
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="card muted">No projects yet — create one to get started.</div>
      )}
    </div>
  );
}
