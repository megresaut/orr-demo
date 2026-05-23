import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend,
} from 'recharts';

function fmt(n) { return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtCompact(n) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1000000) return `$${(v / 1000000).toFixed(1)}M`;
  if (Math.abs(v) >= 1000) return `$${(v / 1000).toFixed(0)}k`;
  return `$${v.toFixed(0)}`;
}

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [banner, setBanner] = useState(null);
  const [search, setSearch] = useState('');
  useEffect(() => {
    api.get('/api/analytics/portfolio').then(setData).catch(() => {});
    api.get('/api/invoices/dunning').then(d => setBanner(d.banner)).catch(() => {});
  }, []);
  const filteredProjects = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    if (!q) return data.projects;
    return data.projects.filter(p => (
      String(p.name || '').toLowerCase().includes(q) ||
      String(p.code || '').toLowerCase().includes(q) ||
      String(p.client_name || '').toLowerCase().includes(q) ||
      String(p.location || '').toLowerCase().includes(q)
    ));
  }, [data, search]);
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
        <div className="kpi">
          <div className="l">Contract value</div>
          <div className="v">{fmt(totals.contract)}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Sum across {projects.length} project{projects.length === 1 ? '' : 's'}</div>
        </div>
        <div className="kpi">
          <div className="l">Delivered</div>
          <div className="v">{fmt(totals.delivered)}</div>
          <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>{totals.contract > 0 ? `${Math.round((Number(totals.delivered) / Number(totals.contract)) * 100)}% of contract` : '—'}</div>
        </div>
        <div className="kpi"><div className="l">Unpaid</div><div className="v">{fmt(totals.unpaid)}</div></div>
      </div>

      {projects.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2>Contract vs Delivered</h2>
          <p className="muted" style={{ marginTop: 0 }}>Per-project performance — how much of each contract has been delivered (services invoiced to date).</p>
          <div style={{ width: '100%', height: Math.max(220, projects.length * 38 + 40) }}>
            <ResponsiveContainer>
              <BarChart
                data={projects.map(p => ({
                  name: p.code || p.name?.slice(0, 22) || `#${p.id}`,
                  full_name: p.name,
                  contract: Number(p.contract_amount || 0),
                  delivered: Number(p.total_services_to_date || 0),
                  unpaid: Number(p.unpaid || 0),
                }))}
                layout="vertical"
                margin={{ top: 5, right: 18, bottom: 5, left: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                <XAxis type="number" tickFormatter={fmtCompact} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(v, k) => [fmt(v), k.charAt(0).toUpperCase() + k.slice(1)]}
                  labelFormatter={(_, payload) => payload?.[0]?.payload?.full_name || ''}
                />
                <Legend />
                <Bar dataKey="contract" fill="#cbd9df" />
                <Bar dataKey="delivered" fill="#2a7a8a" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
        <div className="row" style={{ gap: 12, alignItems: 'baseline' }}>
          <h2 style={{ margin: 0 }}>Projects</h2>
        </div>
        <div className="row" style={{ flex: 1, justifyContent: 'flex-end', gap: 8 }}>
          <input
            type="search"
            placeholder="Search by client, project, code…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <Link to="/projects/new" className="btn btn-sm" style={{ whiteSpace: 'nowrap' }}>+ New project</Link>
        </div>
      </div>
      {projects.length ? (
        filteredProjects.length === 0 ? (
          <div className="card muted">No projects match "{search}".</div>
        ) : (
        <div className="grid grid-3">
          {filteredProjects.map(p => {
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
        )
      ) : (
        <div className="card muted">No projects yet — create one to get started.</div>
      )}
    </div>
  );
}
