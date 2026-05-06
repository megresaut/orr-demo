// db.js — Postgres pool. Prefer DATABASE_URL (managed hosts) and fall back
// to the discrete DB_* vars for local development.
require('dotenv').config();
const { Pool } = require('pg');

async function makePool() {
  if (process.env.DATABASE_URL) {
    return new Pool({
      connectionString: process.env.DATABASE_URL,
      // Most managed Postgres providers (Railway, Render, Neon, Supabase) require SSL.
      // Skip if the URL explicitly says sslmode=disable, or if PGSSLMODE=disable.
      ssl: /sslmode=disable/i.test(process.env.DATABASE_URL) || process.env.PGSSLMODE === 'disable'
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'orr',
    user: process.env.DB_USER || 'orr',
    password: (process.env.DB_PASS || 'orr').replace(/^"|"$/g, ''),
  });
}

module.exports = makePool();
