// controllers/uploadController.js — Excel ingestion endpoints.
// MVP supports two upload types:
//   POST /api/upload/onboarding         — creates a project + rates from the onboarding template
//   POST /api/upload/tasks/:projectId   — replaces project_tasks for a project from the task template
//   POST /api/upload/timesheet/:projectId — appends time_entries for a project

const path = require('path');
const fs = require('fs');
const dbPromise = require('../db');
const { parseProjectOnboarding, parseProjectTasks, parseProjectRates } = require('../services/excelProjectService');
const { parseTimesheet } = require('../services/excelTimesheetService');

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

exports.onboarding = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required (form field name: file)' });
    const parsed = await parseProjectOnboarding(req.file.path);
    if (!parsed.project?.name && !parsed.project?.code) {
      return res.status(400).json({ error: 'Could not find project information in the workbook', parsed });
    }

    const db = await dbPromise;
    await db.query('BEGIN');
    try {
      const proj = await db.query(
        `INSERT INTO projects
          (org_id, name, code, location, description, start_date, end_date,
           client_name, client_contact, client_email, client_phone, client_address,
           contract_amount, allowance, overhead_multiplier, profit_pct, invoice_seq)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
         RETURNING *`,
        [
          req.orgId,
          parsed.project.name || parsed.project.code || 'Untitled Project',
          parsed.project.code || null,
          parsed.project.location || null,
          parsed.project.description || null,
          parsed.timeline?.start_date || null,
          parsed.timeline?.end_date || null,
          parsed.client?.name || null,
          parsed.client?.contact || null,
          parsed.client?.email || null,
          parsed.client?.phone || null,
          parsed.client?.address || null,
          parsed.proposal?.contract_amount || 0,
          parsed.proposal?.allowance || 0,
          parsed.timeline?.overhead_multiplier || 1.66,
          parsed.timeline?.profit_pct || 10,
          `${parsed.project.code || 'INV'}_01`,
        ]
      );
      const projectId = proj.rows[0].id;

      for (const r of parsed.rates || []) {
        if (!r.role) continue;
        await db.query(
          `INSERT INTO project_rates (org_id, project_id, role, name, rate)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.orgId, projectId, r.role, r.name || null, r.rate || 0]
        );
      }
      await db.query('COMMIT');
      res.json({ project: proj.rows[0], rates_added: (parsed.rates || []).length, parsed });
    } catch (e) {
      await db.query('ROLLBACK'); throw e;
    } finally {
      fs.unlink(req.file.path, () => {});
    }
  } catch (err) { next(err); }
};

exports.tasks = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const db = await dbPromise;
    const proj = await db.query(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.projectId, req.orgId]);
    if (!proj.rows[0]) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Project not found' });
    }

    const tasks = await parseProjectTasks(req.file.path, req.body.sheetName || null);
    await db.query('BEGIN');
    try {
      await db.query(`DELETE FROM project_tasks WHERE project_id = $1`, [req.params.projectId]);
      for (const t of tasks) {
        await db.query(
          `INSERT INTO project_tasks
            (org_id, project_id, task_code, task_name, assignee_name, assignee_email,
             start_date, due_date, budget_hours, billed_hours, billing_rate)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            req.orgId, req.params.projectId, t.task_code, t.task_name,
            t.assignee_name, t.assignee_email,
            t.start_date, t.due_date,
            t.budget_hours, t.billed_hours, t.billing_rate,
          ]
        );
      }
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    finally { fs.unlink(req.file.path, () => {}); }
    res.json({ inserted: tasks.length, tasks });
  } catch (err) { next(err); }
};

exports.rates = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const db = await dbPromise;
    const proj = await db.query(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.projectId, req.orgId]);
    if (!proj.rows[0]) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Project not found' });
    }

    const rates = await parseProjectRates(req.file.path, req.body.sheetName || null);
    if (!rates.length) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ error: 'Could not find any resources in the workbook (need Resource Role / Resource Name / Rate columns).' });
    }

    const mode = req.body.mode === 'replace' ? 'replace' : 'append';
    await db.query('BEGIN');
    try {
      if (mode === 'replace') {
        await db.query(`DELETE FROM project_rates WHERE project_id = $1`, [req.params.projectId]);
      }
      let inserted = 0;
      for (const r of rates) {
        if (!r.role) continue;
        await db.query(
          `INSERT INTO project_rates (org_id, project_id, role, name, rate)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.orgId, req.params.projectId, r.role, r.name || null, r.rate || 0]
        );
        inserted++;
      }
      await db.query('COMMIT');
      res.json({ inserted, mode, rates });
    } catch (e) { await db.query('ROLLBACK'); throw e; }
    finally { fs.unlink(req.file.path, () => {}); }
  } catch (err) { next(err); }
};

// Accept HTML <input type="time"> ("HH:MM" 24h) or legacy template formats
// like "10.55AM" / "2.00pm". Returns minutes since midnight, or null.
function timeToMinutes(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  m = t.match(/^(\d{1,2})[.:](\d{2})\s*(am|pm)?$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + Number(m[2]);
}

exports.timesheetManual = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const proj = await db.query(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.projectId, req.orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });

    const { entry_date, start_time, end_time, resource_name, description, task_code } = req.body || {};
    if (!entry_date || !resource_name) {
      return res.status(400).json({ error: 'entry_date and resource_name are required' });
    }

    let hours = Number(req.body.hours || 0);
    if (!hours && start_time && end_time) {
      const a = timeToMinutes(start_time), b = timeToMinutes(end_time);
      if (a != null && b != null) {
        let diff = (b - a) / 60;
        if (diff < 0) diff += 24;
        hours = Math.round(diff * 100) / 100;
      }
    }

    const r = await db.query(
      `INSERT INTO time_entries
        (org_id, project_id, task_code, entry_date, start_time, end_time,
         hours, resource_name, description, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'manual') RETURNING *`,
      [
        req.orgId, req.params.projectId, task_code || null, entry_date,
        start_time || null, end_time || null, hours, resource_name, description || null,
      ]
    );
    res.json({ entry: r.rows[0] });
  } catch (err) { next(err); }
};

exports.timesheet = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'file required' });
    const db = await dbPromise;
    const proj = await db.query(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.projectId, req.orgId]);
    if (!proj.rows[0]) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: 'Project not found' });
    }

    const entries = await parseTimesheet(req.file.path, req.body.sheetName || null);
    await db.query('BEGIN');
    try {
      let inserted = 0;
      for (const e of entries) {
        if (!e.entry_date || !e.resource_name) continue;
        await db.query(
          `INSERT INTO time_entries
            (org_id, project_id, task_code, entry_date, start_time, end_time,
             hours, resource_name, description, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'excel')`,
          [
            req.orgId, req.params.projectId, e.task_code, e.entry_date,
            e.start_time, e.end_time, e.hours, e.resource_name, e.description,
          ]
        );
        inserted++;
      }
      await db.query('COMMIT');
      res.json({ inserted, total_parsed: entries.length, entries });
    } catch (ex) { await db.query('ROLLBACK'); throw ex; }
    finally { fs.unlink(req.file.path, () => {}); }
  } catch (err) { next(err); }
};
