// scripts/migrate.js — runs every .sql file in /migrations in lexical order.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbPromise = require('../db');

(async () => {
  const db = await dbPromise;
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  await db.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    run_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  for (const f of files) {
    const { rows } = await db.query('SELECT 1 FROM schema_migrations WHERE name = $1', [f]);
    if (rows.length) {
      console.log(`[migrate] skip ${f} (already applied)`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`[migrate] applying ${f}`);
    await db.query('BEGIN');
    try {
      await db.query(sql);
      await db.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f]);
      await db.query('COMMIT');
    } catch (err) {
      await db.query('ROLLBACK');
      console.error(`[migrate] failed on ${f}:`, err.message);
      process.exit(1);
    }
  }
  console.log('[migrate] done');
  process.exit(0);
})();
