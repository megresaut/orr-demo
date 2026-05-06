// controllers/settingsController.js — connector picker (slide 13).
// MVP only actually supports 'excel' for each layer; the others are placeholders
// so the Settings UI mirrors the deck.
const dbPromise = require('../db');

const VALID_PM = new Set(['excel', 'asana', 'trello', 'monday', 'clickup', 'basecamp']);
const VALID_TIME = new Set(['excel', 'minute7', 'deputy', 'qbtime']);
const VALID_ACCT = new Set(['excel', 'quickbooks', 'xero', 'wave', 'adp']);

exports.getConnectors = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT pm_connector, time_connector, acct_connector FROM organizations WHERE id = $1`,
      [req.orgId]
    );
    res.json({
      ...rows[0],
      catalogs: {
        project_management: ['excel', 'asana', 'trello', 'monday', 'clickup', 'basecamp'],
        time_tracking: ['excel', 'minute7', 'deputy', 'qbtime'],
        accounting: ['excel', 'quickbooks', 'xero', 'wave', 'adp'],
      },
      supported_now: ['excel'],
    });
  } catch (err) { next(err); }
};

exports.updateConnectors = async (req, res, next) => {
  try {
    const { pm_connector, time_connector, acct_connector } = req.body;
    if (pm_connector && !VALID_PM.has(pm_connector)) return res.status(400).json({ error: 'invalid pm_connector' });
    if (time_connector && !VALID_TIME.has(time_connector)) return res.status(400).json({ error: 'invalid time_connector' });
    if (acct_connector && !VALID_ACCT.has(acct_connector)) return res.status(400).json({ error: 'invalid acct_connector' });

    const sets = [];
    const values = [];
    let i = 1;
    if (pm_connector) { sets.push(`pm_connector = $${i++}`); values.push(pm_connector); }
    if (time_connector) { sets.push(`time_connector = $${i++}`); values.push(time_connector); }
    if (acct_connector) { sets.push(`acct_connector = $${i++}`); values.push(acct_connector); }
    if (!sets.length) return res.status(400).json({ error: 'nothing to update' });
    values.push(req.orgId);

    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE organizations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}
       RETURNING pm_connector, time_connector, acct_connector`, values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};
