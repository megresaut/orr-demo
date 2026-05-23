import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate as fmtDate } from '../lib/dates';
import Combobox from '../components/Combobox';
import PdfModal from '../components/PdfModal';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';

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
  // Per-card toast state so success/error messages render under the card that produced them
  const [taskMsg, setTaskMsg] = useState(''); const [taskErr, setTaskErr] = useState('');
  const [logMsg, setLogMsg] = useState(''); const [logErr, setLogErr] = useState('');
  const [invMsg, setInvMsg] = useState(''); const [invErr, setInvErr] = useState('');
  const [expanded, setExpanded] = useState(new Set());
  const blankEntry = { entry_date: '', start_time: '', end_time: '', resource_name: '', task_code: '', description: '' };
  const [te, setTe] = useState(blankEntry);
  function setTeField(k, v) { setTe(prev => ({ ...prev, [k]: v })); }
  // Filter the Time entries table independently from the invoice period.
  // Default 'all' — show every entry on the project.
  const [entryFilter, setEntryFilter] = useState('all'); // 'all' | 'period'

  // Inline-add forms — "+ Add" rows for Tasks and Resources cards.
  const blankTask = { task_code: '', task_name: '', assignee_name: '', budget_hours: '', billing_rate: '' };
  const [newTask, setNewTask] = useState(blankTask);
  const [taskAddOpen, setTaskAddOpen] = useState(false);
  const [addTaskMsg, setAddTaskMsg] = useState(''); const [addTaskErr, setAddTaskErr] = useState('');
  const blankRate = { role: '', name: '', rate: '' };
  const [newRate, setNewRate] = useState(blankRate);
  const [rateAddOpen, setRateAddOpen] = useState(false);
  const [rateMsg, setRateMsg] = useState(''); const [rateErr, setRateErr] = useState('');

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

  // Entries shown in the table — by default all entries on the project, sorted newest first.
  // Optionally filtered to the invoice period.
  const filteredEntries = useMemo(() => {
    const all = (project?.entries || []).slice().sort((a, b) => {
      const da = String(a.entry_date).slice(0, 10);
      const db = String(b.entry_date).slice(0, 10);
      return db.localeCompare(da);
    });
    if (entryFilter === 'period' && period.startDate && period.endDate) {
      return all.filter(e => {
        const d = String(e.entry_date).slice(0, 10);
        return d >= period.startDate && d <= period.endDate;
      });
    }
    return all;
  }, [project, period, entryFilter]);
  const projectTotal = useMemo(
    () => taskTree.reduce((s, n) => s + (n.rollup?.amount || 0), 0),
    [taskTree]
  );
  const overheadMult = Number(project?.overhead_multiplier || 1.66);
  const profitPct = Number(project?.profit_pct || 10);
  const projectTotalLoaded = projectTotal * overheadMult * (1 + profitPct / 100);
  const isLumpsum = !!project?.is_lumpsum;

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
  async function markProjectDeleted() {
    if (!window.confirm(`Mark project "${project.name}" as deleted? It will be hidden from the dashboard and locked from edits, but invoices and history are kept.`)) return;
    setErr(''); setMsg('');
    try {
      await api.post(`/api/projects/${id}/delete-mark`);
      setMsg('Project marked as deleted.');
      await reload();
    } catch (ex) { setErr(ex.message); }
  }
  async function restoreProject() {
    setErr(''); setMsg('');
    try {
      await api.post(`/api/projects/${id}/restore`);
      setMsg('Project restored.');
      await reload();
    } catch (ex) { setErr(ex.message); }
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
    setTaskMsg(''); setTaskErr(''); setBusy(true);
    try {
      const f = new FormData(e.target);
      const r = await api.upload(`/api/upload/tasks/${id}`, f);
      setTaskMsg(`Loaded ${r.inserted} tasks.`);
      e.target.reset();
      await reload();
    } catch (ex) { setTaskErr(ex.message); }
    finally { setBusy(false); }
  }

  async function submitNewTask(e) {
    e.preventDefault();
    setAddTaskMsg(''); setAddTaskErr(''); setBusy(true);
    try {
      await api.post(`/api/projects/${id}/tasks`, {
        task_code: newTask.task_code || null,
        task_name: newTask.task_name,
        assignee_name: newTask.assignee_name || null,
        budget_hours: Number(newTask.budget_hours) || 0,
        billing_rate: Number(newTask.billing_rate) || 0,
      });
      setAddTaskMsg(`Task "${newTask.task_name}" added.`);
      setNewTask(blankTask);
      setTaskAddOpen(false);
      await reload();
    } catch (ex) { setAddTaskErr(ex.message); }
    finally { setBusy(false); }
  }

  async function submitNewRate(e) {
    e.preventDefault();
    setRateMsg(''); setRateErr(''); setBusy(true);
    try {
      await api.post(`/api/projects/${id}/rates`, {
        role: newRate.role,
        name: newRate.name || null,
        rate: Number(newRate.rate) || 0,
      });
      setRateMsg(`Resource "${newRate.name || newRate.role}" added.`);
      setNewRate(blankRate);
      setRateAddOpen(false);
      await reload();
    } catch (ex) { setRateErr(ex.message); }
    finally { setBusy(false); }
  }

  async function deleteRate(rateId, name) {
    if (!window.confirm(`Remove resource ${name || ''}?`)) return;
    setRateMsg(''); setRateErr('');
    try {
      await api.del(`/api/projects/${id}/rates/${rateId}`);
      setRateMsg('Resource removed.');
      await reload();
    } catch (ex) { setRateErr(ex.message); }
  }

  async function submitTime(e) {
    e.preventDefault();
    setLogMsg(''); setLogErr(''); setBusy(true);
    try {
      await api.post(`/api/upload/timesheet/${id}/manual`, te);
      setLogMsg('Time entry logged.');
      setTe(blankEntry);
      await reload();
    } catch (ex) { setLogErr(ex.message); }
    finally { setBusy(false); }
  }

  async function doPreview() {
    setInvMsg(''); setInvErr('');
    if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
    setBusy(true);
    try {
      const blob = await api.postBlob('/api/invoices/preview-pdf', {
        projectId: Number(id), startDate: period.startDate, endDate: period.endDate,
      });
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (ex) { setInvErr(ex.message); }
    finally { setBusy(false); }
  }

  function closePreview() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }

  async function doGenerate(send = false) {
    setInvMsg(''); setInvErr(''); setBusy(true);
    try {
      const r = await api.post('/api/invoices/generate', {
        projectId: Number(id), startDate: period.startDate, endDate: period.endDate, send,
      });
      let suffix = '';
      if (send) {
        const e = r.email;
        if (!e) suffix = ' (email skipped).';
        else if (e.sent && e.recipient) suffix = ` and emailed to ${e.recipient}.`;
        else if (!e.recipient) suffix = ' — no client email on file, skipped sending.';
        else if (e.reason === 'smtp_not_configured') suffix = ` — SMTP not configured, would have emailed ${e.recipient}.`;
        else suffix = ` — email to ${e.recipient} failed${e.reason ? ` (${e.reason})` : ''}.`;
      } else {
        suffix = ' (draft).';
      }
      setInvMsg(`Invoice ${r.invoice.invoice_number} created${suffix}`);
      closePreview();
      await reload();
    } catch (ex) { setInvErr(ex.message); }
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

  const isDeleted = !!project.deleted_at;

  return (
    <div>
      <div className="muted">{project.code || 'No code'} · {project.client_name || ''}</div>
      <div className="row" style={{ alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 className="page-title" style={{ margin: 0 }}>{project.name}</h1>
        {isDeleted && <span className="pill red" style={{ fontSize: 13 }}>Deleted</span>}
        {isLumpsum && <span className="pill" style={{ fontSize: 13 }}>Lumpsum</span>}
        <div style={{ marginLeft: 'auto' }} className="row">
          {!isDeleted && <Link to={`/projects/${id}/edit`} className="btn btn-sm">Edit project</Link>}
          {isDeleted
            ? <button className="btn btn-sm" onClick={restoreProject}>Restore</button>
            : <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={markProjectDeleted}>Mark as deleted</button>}
        </div>
      </div>
      <div className="muted" style={{ marginBottom: 20 }}>
        {project.start_date || project.end_date ? (
          <>Duration: {fmtDate(project.start_date) || '—'} → {fmtDate(project.end_date) || '—'}</>
        ) : (
          <>No project duration on file</>
        )}
        {project.location ? <> · {project.location}</> : null}
      </div>
      {isDeleted && (
        <div className="banner" style={{ marginBottom: 16 }}>
          <strong>This project is marked deleted.</strong> Edits, time entries, and invoice generation are disabled. Click <em>Restore</em> above to re-enable.
        </div>
      )}
      {msg && <div className="success" style={{ marginBottom: 12 }}>{msg}</div>}
      {err && <div className="error" style={{ marginBottom: 12 }}>{err}</div>}

      <div className="grid grid-4">
        <div className="kpi"><div className="l">Budget hrs</div><div className="v">{k?.budget_hours ?? 0}</div></div>
        <div className="kpi"><div className="l">Actual hrs</div><div className="v">{k?.actual_hours ?? 0}</div></div>
        <div className="kpi"><div className="l">Contract</div><div className="v">{fmt(k?.budget_cost)}</div></div>
        <div className="kpi"><div className="l">Variance @ Compl.</div><div className="v">{fmt(k?.variance_at_completion)}</div></div>
      </div>

      <div className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Upload tasks</h2>
          <p className="muted">From OpeRRa360 task template. Uploading replaces all tasks on this project.</p>
          <form onSubmit={uploadTasks}>
            <input type="file" name="file" accept=".xlsx" required disabled={isDeleted} />
            <button className="btn btn-sm" style={{ marginLeft: 8 }} disabled={busy || isDeleted}>Upload tasks</button>
          </form>
          {taskMsg && <div className="success">{taskMsg}</div>}
          {taskErr && <div className="error">{taskErr}</div>}
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
            <button className="btn btn-sm" disabled={busy || isDeleted}>Log entry</button>
            {logMsg && <div className="success">{logMsg}</div>}
            {logErr && <div className="error">{logErr}</div>}
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
          <button className="btn btn-ghost btn-sm" onClick={doPreview} disabled={!period.startDate || !period.endDate || isDeleted}>Preview</button>
          <button className="btn btn-sm" onClick={() => doGenerate(false)} disabled={!period.startDate || !period.endDate || busy || isDeleted}>Generate</button>
          <button className="btn btn-sm" onClick={() => doGenerate(true)} disabled={!period.startDate || !period.endDate || busy || isDeleted}>Generate & email</button>
        </div>
        {invMsg && <div className="success">{invMsg}</div>}
        {invErr && <div className="error">{invErr}</div>}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <h2 style={{ margin: 0 }}>Time entries ({filteredEntries.length})</h2>
          <div className="row" style={{ gap: 8 }}>
            <button
              type="button"
              className={`btn btn-sm ${entryFilter === 'all' ? '' : 'btn-ghost'}`}
              onClick={() => setEntryFilter('all')}
            >All</button>
            <button
              type="button"
              className={`btn btn-sm ${entryFilter === 'period' ? '' : 'btn-ghost'}`}
              onClick={() => setEntryFilter('period')}
              disabled={!period.startDate || !period.endDate}
              title={!period.startDate || !period.endDate ? 'Select a period above to filter' : ''}
            >In invoice period</button>
          </div>
        </div>
        {filteredEntries.length === 0 ? (
          <div className="muted" style={{ marginTop: 10 }}>
            {entryFilter === 'period'
              ? <>No time entries in {fmtDate(period.startDate)} → {fmtDate(period.endDate)}.</>
              : <>No time entries yet — log time above or upload a timesheet.</>}
          </div>
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
            <button className="btn btn-sm" onClick={() => setTaskAddOpen(v => !v)} disabled={isDeleted}>{taskAddOpen ? 'Cancel' : '+ Add task'}</button>
            <button className="btn btn-ghost btn-sm" onClick={expandAll}>Expand all</button>
            <button className="btn btn-ghost btn-sm" onClick={collapseAll}>Collapse all</button>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 0 }}>
          Click a task with subtasks (▸) to drill down. Totals roll up from children.
        </p>
        {taskAddOpen && (
          <form onSubmit={submitNewTask} style={{ marginBottom: 14, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
            <div className="grid grid-2">
              <div className="field"><label>Task code</label><input value={newTask.task_code} onChange={e => setNewTask(t => ({ ...t, task_code: e.target.value }))} placeholder="e.g. 2.05" /></div>
              <div className="field"><label>Task name *</label><input value={newTask.task_name} onChange={e => setNewTask(t => ({ ...t, task_name: e.target.value }))} required /></div>
              <div className="field"><label>Assignee</label><input value={newTask.assignee_name} onChange={e => setNewTask(t => ({ ...t, assignee_name: e.target.value }))} /></div>
              <div className="field"><label>Budget hours</label><input type="number" step="0.25" min="0" value={newTask.budget_hours} onChange={e => setNewTask(t => ({ ...t, budget_hours: e.target.value }))} /></div>
              <div className="field">
                <label>Billing rate</label>
                <div className="input-prefix"><span>$</span><input type="number" step="0.01" min="0" value={newTask.billing_rate} onChange={e => setNewTask(t => ({ ...t, billing_rate: e.target.value }))} placeholder="0.00" /></div>
              </div>
            </div>
            <button className="btn btn-sm" disabled={busy}>Add task</button>
          </form>
        )}
        {addTaskMsg && <div className="success">{addTaskMsg}</div>}
        {addTaskErr && <div className="error">{addTaskErr}</div>}
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
              {!isLumpsum && (
                <tr style={{ background: 'var(--bg)' }}>
                  <td colSpan={6} style={{ textAlign: 'right', fontWeight: 600 }}>
                    Project total with Overhead ({overheadMult}×) and Profit ({profitPct}%)
                  </td>
                  <td><strong>{fmt(projectTotalLoaded)}</strong></td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <div className="muted">No tasks yet — upload a task workbook above.</div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2 style={{ margin: 0 }}>Labor rates / Resources ({project.rates?.length || 0})</h2>
          <div className="row" style={{ gap: 8 }}>
            <button type="button" className="btn btn-sm" onClick={() => setRateAddOpen(v => !v)} disabled={isDeleted}>{rateAddOpen ? 'Cancel' : '+ Add resource'}</button>
            <label
              className="btn btn-ghost btn-sm"
              style={{
                marginBottom: 0,
                cursor: isDeleted ? 'not-allowed' : 'pointer',
                opacity: isDeleted ? 0.5 : 1,
                pointerEvents: isDeleted ? 'none' : 'auto',
              }}
            >
              Upload (.xlsx)
              <input
                type="file"
                accept=".xlsx"
                disabled={isDeleted}
                style={{ display: 'none' }}
                onChange={async e => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const fd = new FormData();
                  fd.append('file', file);
                  setRateMsg(''); setRateErr(''); setBusy(true);
                  try {
                    const r = await api.upload(`/api/upload/rates/${id}`, fd);
                    setRateMsg(`Loaded ${r.inserted} resources.`);
                    await reload();
                  } catch (ex) { setRateErr(ex.message); }
                  finally { setBusy(false); e.target.value = ''; }
                }}
              />
            </label>
          </div>
        </div>
        <p className="muted" style={{ marginTop: 6 }}>
          Upload appends to existing resources. Excel needs <code>Resource Role</code>, <code>Resource Name</code>, <code>Rate</code> columns.
        </p>
        {rateAddOpen && (
          <form onSubmit={submitNewRate} style={{ marginBottom: 14, padding: 12, background: 'var(--bg)', borderRadius: 8 }}>
            <div className="grid grid-3">
              <div className="field"><label>Role *</label><input value={newRate.role} onChange={e => setNewRate(r => ({ ...r, role: e.target.value }))} required placeholder="Senior Engineer" /></div>
              <div className="field"><label>Name</label><input value={newRate.name} onChange={e => setNewRate(r => ({ ...r, name: e.target.value }))} placeholder="Jane Doe" /></div>
              <div className="field">
                <label>Rate</label>
                <div className="input-prefix"><span>$</span><input type="number" step="0.01" min="0" value={newRate.rate} onChange={e => setNewRate(r => ({ ...r, rate: e.target.value }))} placeholder="0.00" /></div>
              </div>
            </div>
            <button className="btn btn-sm" disabled={busy}>Add resource</button>
          </form>
        )}
        {rateMsg && <div className="success">{rateMsg}</div>}
        {rateErr && <div className="error">{rateErr}</div>}
        <table>
          <thead><tr><th>Role</th><th>Name</th><th>Rate</th><th></th></tr></thead>
          <tbody>
            {(project.rates || []).map(r => (
              <tr key={r.id}>
                <td>{r.role}</td>
                <td>{r.name}</td>
                <td>{fmt(r.rate)}</td>
                <td style={{ width: 1, whiteSpace: 'nowrap' }}>
                  <button className="btn btn-ghost btn-sm btn-danger-ghost" onClick={() => deleteRate(r.id, r.name)} disabled={isDeleted}>Remove</button>
                </td>
              </tr>
            ))}
            {(project.rates || []).length === 0 && (
              <tr><td colSpan={4} className="muted">No resources yet — add one above or upload an Excel file.</td></tr>
            )}
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

      {analytics?.burn_up?.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Cost burn-up</h2>
          <p className="muted" style={{ marginTop: 0 }}>Cumulative billed cost over time, against the contract amount.</p>
          <div style={{ width: '100%', height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={analytics.burn_up} margin={{ top: 5, right: 18, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef1f4" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`} />
                <Tooltip formatter={(v) => fmt(v)} />
                <Legend />
                {Number(analytics?.kpis?.budget_cost) > 0 && (
                  <ReferenceLine y={Number(analytics.kpis.budget_cost)} stroke="#d6453d" strokeDasharray="4 4" label={{ value: 'Contract', position: 'right', fontSize: 11, fill: '#d6453d' }} />
                )}
                <Line type="monotone" dataKey="actual_cost" stroke="#2a7a8a" strokeWidth={2} name="Delivered" dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

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
