// controllers/projectController.js — CRUD for tenant projects.
const dbPromise = require('../db');

exports.list = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT p.*,
              (SELECT COUNT(*) FROM invoices i WHERE i.project_id = p.id) AS invoice_count,
              (SELECT MAX(invoice_number) FROM invoices i WHERE i.project_id = p.id) AS last_invoice_number
         FROM projects p WHERE p.org_id = $1 ORDER BY p.created_at DESC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT * FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    const ratesRes = await db.query(
      `SELECT id, role, name, rate FROM project_rates WHERE project_id = $1 ORDER BY id`,
      [req.params.id]
    );
    const tasksRes = await db.query(
      `SELECT t.*,
              COALESCE((SELECT SUM(hours) FROM time_entries te
                          WHERE te.project_id = t.project_id AND te.task_code = t.task_code), 0) AS actual_hours
         FROM project_tasks t
        WHERE t.project_id = $1
        ORDER BY t.task_code NULLS LAST, t.id`,
      [req.params.id]
    );
    const entriesRes = await db.query(
      `SELECT id, entry_date, start_time, end_time, hours, resource_name, task_code,
              description, source, created_at
         FROM time_entries WHERE project_id = $1
        ORDER BY entry_date DESC, id DESC`,
      [req.params.id]
    );
    res.json({ ...rows[0], rates: ratesRes.rows, tasks: tasksRes.rows, entries: entriesRes.rows });
  } catch (err) { next(err); }
};

exports.create = async (req, res, next) => {
  try {
    const b = req.body || {};
    const db = await dbPromise;
    const { rows } = await db.query(
      `INSERT INTO projects
        (org_id, name, code, location, description, start_date, end_date,
         client_name, client_contact, client_email, client_phone, client_address,
         contract_amount, allowance, overhead_multiplier, profit_pct, invoice_seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        req.orgId, b.name, b.code || null, b.location || null, b.description || null,
        b.start_date || null, b.end_date || null,
        b.client_name || null, b.client_contact || null, b.client_email || null,
        b.client_phone || null, b.client_address || null,
        b.contract_amount || 0, b.allowance || 0,
        b.overhead_multiplier || 1.66, b.profit_pct || 10,
        b.invoice_seq || `${b.code || 'INV'}_01`,
      ]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = [
      'name', 'code', 'location', 'description', 'start_date', 'end_date',
      'client_name', 'client_contact', 'client_email', 'client_phone', 'client_address',
      'contract_amount', 'allowance', 'overhead_multiplier', 'profit_pct', 'invoice_seq',
    ];
    const sets = []; const values = []; let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${i++}`); values.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    values.push(req.params.id, req.orgId);

    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE projects SET ${sets.join(', ')}, updated_at = NOW()
        WHERE id = $${i} AND org_id = $${i + 1} RETURNING *`,
      values
    );
    if (!rows[0]) return res.status(404).json({ error: 'Project not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const db = await dbPromise;
    await db.query(`DELETE FROM projects WHERE id = $1 AND org_id = $2`, [req.params.id, req.orgId]);
    res.json({ ok: true });
  } catch (err) { next(err); }
};

exports.replaceRates = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const proj = await db.query(`SELECT id FROM projects WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]);
    if (!proj.rows[0]) return res.status(404).json({ error: 'Project not found' });

    await db.query('BEGIN');
    try {
      await db.query(`DELETE FROM project_rates WHERE project_id = $1`, [req.params.id]);
      const rates = Array.isArray(req.body?.rates) ? req.body.rates : [];
      for (const r of rates) {
        if (!r.role) continue;
        await db.query(
          `INSERT INTO project_rates (org_id, project_id, role, name, rate)
           VALUES ($1, $2, $3, $4, $5)`,
          [req.orgId, req.params.id, r.role, r.name || null, r.rate || 0]
        );
      }
      await db.query('COMMIT');
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    }
    const out = await db.query(`SELECT id, role, name, rate FROM project_rates WHERE project_id = $1 ORDER BY id`,
      [req.params.id]);
    res.json(out.rows);
  } catch (err) { next(err); }
};
