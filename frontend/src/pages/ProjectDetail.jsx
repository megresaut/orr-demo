import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import Combobox from '../components/Combobox';
import PdfModal from '../components/PdfModal';

// Sort dotted task codes naturally: "1.01" < "1.01.02" < "2.01" < "2.02"
function compareCodes(a, b) {
  const A = String(a || '').split('.').map(n => Number(n) || 0);
  const B = String(b || '').split('.').map(n => Number(n) || 0);
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    const x = A[i] ?? -1, y = B[i] ?? -1;
    if (x !== y) return x - y;
  }
  return 0;
}

function fmt(n) { return `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Build a tree of tasks from dotted task codes ("1.01" is parent of "1.01.02").
// Tasks without a parent in the list become roots. Tasks without a code go in their
// own bucket so they're still visible.
function buildTaskTree(tasks) {
  const byCode = new Map();
  const roots = [];
  const orphans = [];

  for (const t of tasks) {
    byCode.set(t.task_code, { ...t, children: [] });
  }
  for (const t of tasks) {
    const node = byCode.get(t.task_code);
    if (!t.task_code) { orphans.push(node); continue; }
    const parts = String(t.task_code).split('.');
    let parent = null;
    for (let i = parts.length - 1; i > 0; i--) {
      const candidate = parts.slice(0, i).join('.');
      if (byCode.has(candidate)) { parent = byCode.get(candidate); break; }
    }
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  // Roll-up totals up the tree
  function rollup(node) {
    let budget = Number(node.budget_hours || 0);
    let actual = Number(node.actual_hours || 0);
    let amount = actual * Number(node.billing_rate || 0);
    for (const c of node.children) {
      const r = rollup(c);
      budget += r.budget;
      actual += r.actual;
      amount += r.amount;
    }
    node.rollup = { budget, actual, amount };
    return node.rollup;
  }
  roots.forEach(rollup);
  orphans.forEach(rollup);
  return [...roots, ...orphans];
}

function TaskRow({ node, depth, expanded, toggle }) {
  const hasKids = node.children.length > 0;
  const isOpen = expanded.has(node.task_code || `_${node.id}`);
  const own = {
    budget: Number(node.budget_hours || 0),
    actual: Number(node.actual_hours || 0),
    rate: Number(node.billing_rate || 0),
  };
  const ownTotal = own.actual * own.rate;
  return (
    <>
      <tr
        onClick={hasKids ? () => toggle(node.task_code || `_${node.id}`) : undefined}
        style={{ cursor: hasKids ? 'pointer' : 'default', background: depth === 0 ? 'transparent' : 'rgba(0,0,0,0.015)' }}
      >
        <td style={{ paddingLeft: 10 + depth * 24 }}>
          {hasKids
            ? <span style={{ display: 'inline-block', width: 14, color: 'var(--muted)' }}>{isOpen ? '▾' : '▸'}</span>
            : <span style={{ display: 'inline-block', width: 14 }} />}
          {node.task_code || '—'}
        </td>
        <td style={{ fontWeight: depth === 0 ? 600 : 400 }}>{node.task_name}</td>
        <td>{node.assignee_name || ''}</td>
        <td>{own.budget || (hasKids ? '—' : 0)}</td>
        <td>{own.actual.toFixed(2)}</td>
        <td>{own.rate ? fmt(own.rate) : ''}</td>
        <td><strong>{fmt(hasKids ? node.rollup.amount : ownTotal)}</strong></td>
      </tr>
      {hasKids && isOpen && node.children.map(c => (
        <TaskRow key={c.id} node={c} depth={depth + 1} expanded={expanded} toggle={toggle} />
      ))}
    </>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [period, setPeriod] = useState({ startDate: '', endDate: '' });
  const [previewUrl, setPreviewUrl] = useState(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(new Set());
  const blankEntry = { entry_date: '', start_time: '', end_time: '', resource_name: '', task_code: '', description: '' };
  const [te, setTe] = useState(blankEntry);
  function setTeField(k, v) { setTe(prev => ({ ...prev, [k]: v })); }

  const taskTree = useMemo(() => buildTaskTree(project?.tasks || []), [project]);

  const resourceOptions = useMemo(() => (
    (project?.rates || []).map(r => ({
      value: r.name,
      label: `${r.name} — ${r.role}`,
    }))
  ), [project]);

  const taskOptions = useMemo(() => (
    (project?.tasks || [])
      .filter(t => t.task_code)
      .slice()
      .sort((a, b) => compareCodes(a.task_code, b.task_code))
      .map(t => ({
        value: t.task_code,
        label: `${t.task_code} — ${t.task_name}`,
      }))
  ), [project]);

  // Returns null when no full period is selected so the UI can show a prompt;
  // otherwise the entries falling within [startDate, endDate] inclusive.
  const filteredEntries = useMemo(() => {
    if (!period.startDate || !period.endDate) return null;
    return (project?.entries || []).filter(e => {
      const d = String(e.entry_date).slice(0, 10);
      return d >= period.startDate && d <= period.endDate;
    });
  }, [project, period]);
  const projectTotal = useMemo(
    () => taskTree.reduce((s, n) => s + (n.rollup?.amount || 0), 0),
    [taskTree]
  );

  function toggleNode(key) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function expandAll() {
    const all = new Set();
    function walk(nodes) {
      for (const n of nodes) {
        if (n.children.length) all.add(n.task_code || `_${n.id}`);
        walk(n.children);
      }
    }
    walk(taskTree);
    setExpanded(all);
  }
  function collapseAll() { setExpanded(new Set()); }

  const [notFound, setNotFound] = useState(false);

  async function reload() {
    try {
      const [proj, anal, allInv] = await Promise.all([
        api.get(`/api/projects/${id}`),
        api.get(`/api/analytics/projects/${id}`),
        api.get(`/api/invoices`),
      ]);
      setProject(proj);
      setAnalytics(anal);
      setInvoices(allInv.filter(i => Number(i.project_id) === Number(id)));
    } catch (e) {
      if (/not found/i.test(e.message) || /404/.test(e.message)) {
        setNotFound(true);
      } else {
        setErr(e.message);
      }
    }
  }

  async function markPaid(invId) {
    await api.post(`/api/invoices/${invId}/mark-paid`);
    await reload();
  }
  async function deleteInvoice(inv) {
    const ok = window.confirm(`Delete invoice ${inv.invoice_number}? This removes the row and its xlsx/pdf files.`);
    if (!ok) return;
    setMsg(''); setErr('');
    try {
      await api.del(`/api/invoices/${inv.id}`);
      setMsg(`Invoice ${inv.invoice_number} deleted.`);
      await reload();
    } catch (ex) { setErr(ex.message); }
  }
  useEffect(() => { reload().catch(e => setErr(e.message)); }, [id]);

  async function uploadTasks(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    try {
      const f = new FormData(e.target);
      const r = await api.upload(`/api/upload/tasks/${id}`, f);
      setMsg(`Loaded ${r.inserted} tasks.`);
      e.target.reset();
      await reload();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function submitTime(e) {
    e.preventDefault();
    setMsg(''); setErr(''); setBusy(true);
    try {
      await api.post(`/api/upload/timesheet/${id}/manual`, te);
      setMsg('Time entry logged.');
      setTe(blankEntry);
      await reload();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function doPreview() {
    setMsg(''); setErr('');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setBusy(true);
    try {
      const blob = await api.postBlob('/api/invoices/preview-pdf', {
        projectId: Number(id), startDate: period.startDate, endDate: period.endDate,
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function doGenerate(send = false) {
    setMsg(''); setErr(''); setBusy(true);
    try {
      const r = await api.post('/api/invoices/generate', {
        projectId: Number(id), startDate: period.startDate, endDate: period.endDate, send,
      });
      setMsg(`Invoice ${r.invoice.invoice_number} created (${send ? 'and emailed' : 'draft'}).`);
      closePreview();
      await reload();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  if (notFound) {
    return (
      <div className="card" style={{ maxWidth: 480 }}>
        <h2>Project not found</h2>
        <p className="muted">This project ID doesn't exist (or doesn't belong to your account). The demo data was reseeded — IDs may have changed.</p>
        <Link to="/" className="btn btn-sm">Back to dashboard</Link>
      </div>
    );
  }
  if (!project) return <div>Loading…</div>;
  const k = analytics?.kpis;

  return (
    <div>
      <div className="muted">{project.code || 'No code'} · {project.client_name || ''}</div>
      <h1 className="page-title">{project.name}</h1>

      <div className="grid grid-4">
        <div className="kpi"><div className="l">Budget hrs</div><div className="v">{k?.budget_hours ?? 0}</div></div>
        <div className="kpi"><div className="l">Actual hrs</div><div className="v">{k?.actual_hours ?? 0}</div></div>
        <div className="kpi"><div className="l">Contract</div><div className="v">{fmt(k?.budget_cost)}</div></div>
        <div className="kpi"><div className="l">Variance @ Compl.</div><div className="v">{fmt(k?.variance_at_completion)}</div></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Upload tasks</h2>
          <p className="muted">From OpeRRa360 task template.</p>
          <form onSubmit={uploadTasks}>
            <input type="file" name="file" accept=".xlsx" required />
            <button className="btn btn-sm" style={{ marginLeft: 8 }} disabled={busy}>Upload tasks</button>
          </form>
        </div>
        <div className="card">
          <h2>Log time</h2>
          <p className="muted">Submit a single time entry directly — no upload needed.</p>
          <form onSubmit={submitTime}>
            <div className="row">
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Date</label>
                <input type="date" required value={te.entry_date} onChange={e => setTeField('entry_date', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>Start</label>
                <input type="time" value={te.start_time} onChange={e => setTeField('start_time', e.target.value)} />
              </div>
              <div className="field" style={{ marginBottom: 8 }}>
                <label>End</label>
                <input type="time" value={te.end_time} onChange={e => setTeField('end_time', e.target.value)} />
              </div>
            </div>
            <div className="row">
              <div className="field" style={{ marginBottom: 8, flex: 1 }}>
                <label>Resource</label>
                <Combobox
                  value={te.resource_name}
                  onChange={v => setTeField('resource_name', v)}
                  options={resourceOptions}
                  placeholder="Search by name or role…"
                  required
                />
              </div>
              <div className="field" style={{ marginBottom: 8, flex: 1 }}>
                <label>Task</label>
                <Combobox
                  value={te.task_code}
                  onChange={v => setTeField('task_code', v)}
                  options={taskOptions}
                  placeholder="Search by code or task name…"
                  indent
                  allowEmptyLabel="— no task —"
                />
              </div>
            </div>
            <div className="field" style={{ marginBottom: 8 }}>
              <label>Description</label>
              <input type="text" placeholder="What did you work on?" value={te.description} onChange={e => setTeField('description', e.target.value)} />
            </div>
            <button className="btn btn-sm" disabled={busy}>Log entry</button>
          </form>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Generate invoice</h2>
        <div className="row">
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Period start</label>
            <input type="date" value={period.startDate} onChange={e => setPeriod(p => ({ ...p, startDate: e.target.value }))} />
          </div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label>Period end</label>
            <input type="date" value={period.endDate} onChange={e => setPeriod(p => ({ ...p, endDate: e.target.value }))} />
          </div>
          <button className="btn btn-ghost btn-sm" onClick={doPreview} disabled={!period.startDate || !period.endDate}>Preview</button>
          <button className="btn btn-sm" onClick={() => doGenerate(false)} disabled={!period.startDate || !period.endDate || busy}>Generate</button>
          <button className="btn btn-sm" onClick={() => doGenerate(true)} disabled={!period.startDate || !period.endDate || busy}>Generate & email</button>
        </div>
        {msg && <div className="success">{msg}</div>}
        {err && <div className="error">{err}</div>}

      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>
          Time entries
          {filteredEntries !== null && ` (${filteredEntries.length})`}
        </h2>
        {filteredEntries === null ? (
          <div className="muted">Please select a period above to view time entries.</div>
        ) : filteredEntries.length === 0 ? (
          <div className="muted">No time entries in {fmtDate(period.startDate)} → {fmtDate(period.endDate)}.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Resource</th>
                <th>Task</th>
                <th>Hours</th>
                <th>Description</th>
                <th>Source</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map(e => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(e.entry_date)}</td>
                  <td>{e.resource_name}</td>
                  <td>{e.task_code || <span className="muted">—</span>}</td>
                  <td>{Number(e.hours || 0).toFixed(2)}</td>
                  <td>{e.description || <span className="muted">—</span>}</td>
                  <td><span className="pill">{e.source || 'manual'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {previewUrl && (
        <PdfModal
          url={previewUrl}
          downloadName={`${project.code || 'invoice'}-preview.pdf`}
          title={`${project.code || 'Invoice'} preview · ${period.startDate} → ${period.endDate}`}
          onClose={closePreview}
        />
      )}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>Tasks ({project.tasks?.length || 0})</h2>
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={expandAll}>Expand all</button>
            <button className="btn btn-ghost btn-sm" onClick={collapseAll}>Collapse all</button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Click a task with subtasks (▸) to drill down. Totals roll up from children.
        </p>
        {taskTree.length ? (
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th>Assignee</th>
                <th>Budget hrs</th><th>Actual hrs</th><th>Rate</th><th>Total</th>
              </tr>
            </thead>
            <tbody>
              {taskTree.map(n => (
                <TaskRow key={n.id} node={n} depth={0} expanded={expanded} toggle={toggleNode} />
              ))}
              <tr style={{ background: 'var(--bg)' }}>
                <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>Project total</td>
                <td><strong>{fmt(projectTotal)}</strong></td>
              </tr>
            </tbody>
          </table>
        ) : (
          <div className="muted">No tasks yet — upload a task workbook above.</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Labor rates ({project.rates?.length || 0})</h2>
        <table>
          <thead><tr><th>Role</th><th>Name</th><th>Rate</th></tr></thead>
          <tbody>
            {(project.rates || []).map(r => (
              <tr key={r.id}><td>{r.role}</td><td>{r.name}</td><td>{fmt(r.rate)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Invoices ({invoices.length})</h2>
        {invoices.length ? (
          <table>
            <thead>
              <tr>
                <th>Number</th><th>Period</th><th>Subtotal</th><th>Overhead</th><th>Profit</th><th>Total</th><th>Status</th><th>Files</th><th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map(i => (
                <tr key={i.id}>
                  <td>{i.invoice_number}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(i.period_start)} → {fmtDate(i.period_end)}</td>
                  <td>{fmt(i.subtotal)}</td>
                  <td>{fmt(i.overhead)}</td>
                  <td>{fmt(i.profit)}</td>
                  <td><strong>{fmt(i.total)}</strong></td>
                  <td><span className={`pill ${i.status === 'paid' ? 'green' : 'red'}`}>{i.status}</span></td>
                  <td>
                    {i.xlsx_path && <a href={`/${i.xlsx_path}`} target="_blank" rel="noreferrer">xlsx</a>}{' '}
                    {i.pdf_path && <a href={`/${i.pdf_path}`} target="_blank" rel="noreferrer">pdf</a>}
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    {i.status !== 'paid' && (
                      <button className="btn btn-ghost btn-sm" onClick={() => markPaid(i.id)}>Mark paid</button>
                    )}{' '}
                    <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => deleteInvoice(i)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="muted">No invoices yet — pick a period above and click Generate.</div>
        )}
      </div>

      {analytics?.by_resource?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Resource utilization</h2>
          <table>
            <thead><tr><th>Resource</th><th>Hours</th><th>Cost</th></tr></thead>
            <tbody>
              {analytics.by_resource.map(r => (
                <tr key={r.resource_name}>
                  <td>{r.resource_name}</td><td>{r.hours}</td><td>{fmt(r.cost)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
