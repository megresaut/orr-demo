// controllers/orgController.js — manages the current tenant's profile + branding.
const fs = require('fs');
const path = require('path');
const dbPromise = require('../db');

// Columns to expose on JSON responses — excludes logo_data (BYTEA) to keep
// payloads small; logo bytes are served via /api/public/orgs/:id/logo.
const ORG_COLS = 'id, name, slug, logo_url, logo_mime, address, phone, contact_email, ' +
  'pm_connector, time_connector, acct_connector, plan_tier, trial_ends_at, cc_on_file, ' +
  'created_at, updated_at';

exports.getCurrent = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(`SELECT ${ORG_COLS} FROM organizations WHERE id = $1`, [req.orgId]);
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
      `UPDATE organizations SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i} RETURNING ${ORG_COLS}`,
      values
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.uploadLogo = async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded (field name: "logo")' });

    // Read the upload into memory, then remove the on-disk copy — bytes live in Postgres
    // so that uploads survive Railway redeploys (which wipe the container filesystem).
    const filePath = req.file.path;
    const buf = await fs.promises.readFile(filePath);
    fs.promises.unlink(filePath).catch(() => {});

    const mime = req.file.mimetype || 'application/octet-stream';
    // Cache-buster so browsers refresh after a re-upload.
    const url = `/api/public/orgs/${req.orgId}/logo?v=${Date.now()}`;

    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE organizations
          SET logo_data = $1, logo_mime = $2, logo_url = $3, updated_at = NOW()
        WHERE id = $4
        RETURNING ${ORG_COLS}`,
      [buf, mime, url, req.orgId]
    );
    res.json({ logo_url: url, organization: rows[0] });
  } catch (err) { next(err); }
};

exports.removeLogo = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE organizations
          SET logo_data = NULL, logo_mime = NULL, logo_url = NULL, updated_at = NOW()
        WHERE id = $1
        RETURNING ${ORG_COLS}`,
      [req.orgId]
    );
    res.json({ organization: rows[0] });
  } catch (err) { next(err); }
};
