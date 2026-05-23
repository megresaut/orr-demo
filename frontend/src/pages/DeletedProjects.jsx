import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';

function fmt(n) { return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function DeletedProjects() {
  const [projects, setProjects] = useState(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    api.get('/api/projects?deletedOnly=1').then(setProjects).catch(e => setErr(e.message));
  }, []);

  if (err) return <div className="error">{err}</div>;
  if (!projects) return <div>Loading…</div>;

  return (
    <div>
      <h1 className="page-title">Deleted projects</h1>
      <p className="muted">
        These projects are hidden from the dashboard and excluded from portfolio totals.
        Open one and click <em>Restore</em> to bring it back.
      </p>
      <div style={{ marginBottom: 16 }}>
        <Link to="/" className="btn btn-ghost btn-sm">← Back to dashboard</Link>
      </div>
      {projects.length === 0 ? (
        <div className="card muted">No deleted projects.</div>
      ) : (
        <div className="card">
          <table>
            <thead>
              <tr><th>Code</th><th>Name</th><th>Client</th><th>Contract</th><th></th></tr>
            </thead>
            <tbody>
              {projects.map(p => (
                <tr key={p.id}>
                  <td><span className="pill">{p.code || 'No code'}</span></td>
                  <td>{p.name}</td>
                  <td>{p.client_name || '—'}</td>
                  <td>{fmt(p.contract_amount)}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <Link to={`/projects/${p.id}`} className="btn btn-ghost btn-sm">Open / Restore</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
