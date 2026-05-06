// controllers/orgController.js — manages the current tenant's profile + branding.
const dbPromise = require('../db');

exports.getCurrent = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query('SELECT * FROM organizations WHERE id = $1', [req.orgId]);
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.update = async (req, res, next) => {
  try {
    const allowed = ['name', 'logo_url', 'address', 'phone', 'contact_email'];
    const sets = [];
    const values = [];
    let i = 1;
    for (const k of allowed) {
      if (req.body[k] !== undefined) { sets.push(`${k} = $${i++}`); values.push(req.body[k]); }
    }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    values.push(req.orgId);
    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE organizations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING *`,
      values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};
