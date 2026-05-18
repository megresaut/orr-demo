// scripts/backfill-logos.js — one-time migration of any legacy on-disk logos
// (backend/uploads/logos/<orgId>.<ext>) into the organizations.logo_data column.
// Idempotent: only fills rows where logo_data IS NULL.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const dbPromise = require('../db');

// Look in two places, in order: a committed seed dir that ships with the image
// (so first-deploy bootstraps work on Railway), then any legacy on-disk uploads
// (so local dev environments migrate cleanly).
const LOGO_DIRS = [
  path.join(__dirname, '..', 'seed', 'logos'),
  path.join(__dirname, '..', 'uploads', 'logos'),
];

const MIME_BY_EXT = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

(async () => {
  try {
    const db = await dbPromise;
    let filled = 0;
    for (const dir of LOGO_DIRS) {
      if (!fs.existsSync(dir)) continue;
      for (const f of fs.readdirSync(dir)) {
        const ext = path.extname(f).toLowerCase();
        const mime = MIME_BY_EXT[ext];
        if (!mime) continue;
        const orgId = Number(path.basename(f, ext));
        if (!Number.isFinite(orgId)) continue;

        const cur = await db.query(
          'SELECT logo_data IS NOT NULL AS has_data FROM organizations WHERE id = $1',
          [orgId]
        );
        if (!cur.rows[0]) {
          console.log(`[backfill-logos] org ${orgId} not found, skipping ${f}`);
          continue;
        }
        if (cur.rows[0].has_data) {
          console.log(`[backfill-logos] org ${orgId} already has logo_data, skipping ${f}`);
          continue;
        }
        const buf = fs.readFileSync(path.join(dir, f));
        const url = `/api/public/orgs/${orgId}/logo?v=${Date.now()}`;
        await db.query(
          `UPDATE organizations
              SET logo_data = $1, logo_mime = $2, logo_url = $3, updated_at = NOW()
            WHERE id = $4`,
          [buf, mime, url, orgId]
        );
        filled++;
        console.log(`[backfill-logos] filled org ${orgId} from ${path.basename(dir)}/${f} (${buf.length} bytes)`);
      }
    }
    console.log(`[backfill-logos] done (${filled} filled)`);
    process.exit(0);
  } catch (err) {
    console.error('[backfill-logos] failed:', err.message);
    // Non-fatal: app should still boot. Exit 0 so the container start chain continues.
    process.exit(0);
  }
})();
