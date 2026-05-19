import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { formatDate } from '../lib/dates';

function fmt(n) { return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }

export default function Invoices() {
  const [list, setList] = useState([]);
  async function reload() { setList(await api.get('/api/invoices')); }
  useEffect(() => { reload().catch(() => {}); }, []);

  async function markPaid(id) {
    await api.post(`/api/invoices/${id}/mark-paid`);
    await reload();
  }

  return (
    <div>
      <h1 className="page-title">Invoices</h1>
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Number</th><th>Project</th><th>Period</th><th>Total</th><th>Status</th><th>Files</th><th></th>
            </tr>
          </thead>
          <tbody>
            {list.map(i => (
              <tr key={i.id}>
                <td>{i.invoice_number}</td>
                <td>{i.project_code || ''} {i.project_name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>{formatDate(i.period_start)} → {formatDate(i.period_end)}</td>
                <td>{fmt(i.total)}</td>
                <td><span className={`pill ${i.status === 'paid' ? 'green' : 'red'}`}>{i.status}</span></td>
                <td>
                  {i.xlsx_path && <a href={`/${i.xlsx_path}`} target="_blank" rel="noreferrer">xlsx</a>}{' '}
                  {i.pdf_path && <a href={`/${i.pdf_path}`} target="_blank" rel="noreferrer">pdf</a>}
                </td>
                <td>
                  {i.status !== 'paid' && (
                    <button className="btn btn-ghost btn-sm" onClick={() => markPaid(i.id)}>Mark paid</button>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && <tr><td colSpan={7} className="muted">No invoices yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
