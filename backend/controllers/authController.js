// controllers/authController.js — signup creates an organization + admin user.
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const dbPromise = require('../db');

const SALT_ROUNDS = 10;
const TRIAL_DAYS = 7;

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function signToken(userId, orgId) {
  return jwt.sign({ userId, orgId }, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
}

exports.signup = async (req, res, next) => {
  try {
    const { email, password, fullName, companyName, planTier } = req.body;
    if (!email || !password || !companyName) {
      return res.status(400).json({ error: 'email, password and companyName are required' });
    }
    const db = await dbPromise;

    const existing = await db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rows.length) return res.status(409).json({ error: 'Email already registered' });

    const baseSlug = slugify(companyName) || `org-${Date.now()}`;
    let slug = baseSlug;
    for (let i = 1; (await db.query('SELECT 1 FROM organizations WHERE slug = $1', [slug])).rows.length; i++) {
      slug = `${baseSlug}-${i}`;
    }

    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const orgRes = await db.query(
      `INSERT INTO organizations (name, slug, plan_tier, trial_ends_at)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [companyName, slug, planTier || 'standard', trialEnds]
    );
    const org = orgRes.rows[0];

    const hash = await bcrypt.hash(password, SALT_ROUNDS);
    const userRes = await db.query(
      `INSERT INTO users (org_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin') RETURNING id, email, full_name, role`,
      [org.id, email, hash, fullName || null]
    );
    const user = userRes.rows[0];

    const token = signToken(user.id, org.id);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({ token, user, organization: org });
  } catch (err) { next(err); }
};

exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'email and password required' });
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT u.*, o.id AS o_id, o.name AS o_name, o.slug AS o_slug, o.plan_tier, o.trial_ends_at, o.cc_on_file
         FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.email = $1`, [email]);
    const u = rows[0];
    if (!u) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, u.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken(u.id, u.org_id);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 });
    res.json({
      token,
      user: { id: u.id, email: u.email, full_name: u.full_name, role: u.role },
      organization: {
        id: u.o_id, name: u.o_name, slug: u.o_slug,
        plan_tier: u.plan_tier, trial_ends_at: u.trial_ends_at, cc_on_file: u.cc_on_file
      }
    });
  } catch (err) { next(err); }
};

exports.me = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT u.id, u.email, u.full_name, u.role,
              o.id AS o_id, o.name AS o_name, o.slug AS o_slug, o.logo_url, o.address,
              o.phone, o.contact_email, o.pm_connector, o.time_connector, o.acct_connector,
              o.plan_tier, o.trial_ends_at, o.cc_on_file
         FROM users u JOIN organizations o ON o.id = u.org_id WHERE u.id = $1`, [req.userId]);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: 'Not found' });
    res.json({
      user: { id: u.id, email: u.email, full_name: u.full_name, role: u.role },
      organization: {
        id: u.o_id, name: u.o_name, slug: u.o_slug, logo_url: u.logo_url,
        address: u.address, phone: u.phone, contact_email: u.contact_email,
        pm_connector: u.pm_connector, time_connector: u.time_connector, acct_connector: u.acct_connector,
        plan_tier: u.plan_tier, trial_ends_at: u.trial_ends_at, cc_on_file: u.cc_on_file,
      },
    });
  } catch (err) { next(err); }
};

exports.logout = (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
};
