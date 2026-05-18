// routes/publicRoutes.js — unauthenticated endpoints (currently org logos for <img> tags
// and PDF embedding). Mounted under /api/public.
const express = require('express');
const dbPromise = require('../db');

const router = express.Router();

router.get('/orgs/:orgId/logo', async (req, res, next) => {
  try {
    const orgId = Number(req.params.orgId);
    if (!Number.isFinite(orgId)) return res.status(400).end();
    const db = await dbPromise;
    const { rows } = await db.query(
      'SELECT logo_data, logo_mime FROM organizations WHERE id = $1',
      [orgId]
    );
    const r = rows[0];
    if (!r || !r.logo_data) return res.status(404).end();
    res.setHeader('Content-Type', r.logo_mime || 'application/octet-stream');
    // Short cache; the uploadLogo response includes a ?v=<ts> cache-buster.
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.send(r.logo_data);
  } catch (err) { next(err); }
});

module.exports = router;
