// middleware/auth.js — JWT auth that also resolves org context.
const jwt = require('jsonwebtoken');
const dbPromise = require('../db');

async function requireAuth(req, res, next) {
  const tokenFromCookie = req.cookies?.token;
  const authHeader = req.headers.authorization;
  const token = tokenFromCookie || (authHeader && authHeader.split(' ')[1]);

  if (!token) return res.status(401).json({ error: 'Missing authentication token' });

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    req.userId = payload.userId;
    req.orgId = payload.orgId;

    if (!req.orgId) {
      const db = await dbPromise;
      const { rows } = await db.query('SELECT org_id FROM users WHERE id = $1', [req.userId]);
      if (!rows[0]) return res.status(401).json({ error: 'User not found' });
      req.orgId = rows[0].org_id;
    }
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { requireAuth };
