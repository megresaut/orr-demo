# Bug-fix session decisions

Tracking decisions made autonomously while working through the OpeRRa Testing.xlsx items. Each entry: context → decision → why.

## D1 — Platform logo file source
**Context:** User attached an inline image (teal OR/CR with arrow + network motif) saying "logo also has to be in the platform". I can't write image-message bytes to disk from this tool environment.
**Decision:** Create `frontend/src/assets/operra-logo.png` as a placeholder; render via `<img src={logoUrl}>` with `logoUrl` imported from that path. User can drop the actual PNG at that exact path and it will appear without any code change. Sidebar text fallback ("OpeRRa") shown if image missing via `onError` handler.
**Why:** Keeps the wiring complete; image swap is a one-step user action, not a code change.

## D2 — Platform brand name shown alongside logo
**Context:** Sidebar currently says "ORR". Product is called "OpeRRa" in marketing materials / spreadsheet name.
**Decision:** Use "OpeRRa" as the visible brand string. Keep "ORR" as the slug/internal name.
**Why:** Logo art shows OR with an upward arrow — matches "OpeRRa" branding from the testing workbook filename.

## D3 — Logo upload storage
**Context:** Need somewhere to put tenant logos.
**Decision:** Local disk at `backend/uploads/logos/<orgId>.<ext>`, served via `app.use('/uploads', express.static(...))`. Filename uses orgId so re-uploads overwrite cleanly. Accept `image/png`, `image/jpeg`, `image/svg+xml`, `image/webp` ≤ 2 MB.
**Why:** Matches the existing pattern (`/invoices` static dir). S3 is on the roadmap but not required for the demo.

## D4 — Logo URL behavior on invoice PDF
**Context:** `pdfService.js` renders via Puppeteer (or fallback HTML). For Puppeteer to render the logo offline, need to inline as data URI; relative `/uploads/...` won't resolve in headless.
**Decision:** Read the logo file from disk, base64-encode, embed as `<img src="data:image/...;base64,...">` in the PDF HTML. Skip silently if file missing.
**Why:** Robust against missing file; avoids Puppeteer network dependency.

## D5 — Forgot password without SMTP
**Context:** Most local/demo runs don't have SMTP configured. Email-based reset would silently fail.
**Decision:** Always store reset token + return success to the user (don't leak whether email exists). When SMTP isn't configured, log the reset link to server console (clearly tagged). Token valid 1 hr.
**Why:** Non-leaking response is standard practice; console-link is workable for the local demo and won't be hit in prod once SMTP is set.

## D6 — Recharts vs no-dep custom SVG
**Context:** Tester wants charts on KPI screen.
**Decision:** Add `recharts` to `frontend/package.json` (small bundle, well-supported with React 18+).
**Why:** Implementing charts from scratch in SVG would take 3-5x the time for inferior interactivity.

## D7 — Re-importing tasks vs adding new ones
**Context:** Today the tasks-upload replaces all tasks. Tester wants to *add* new tasks mid-project (+ button) without losing existing ones.
**Decision:** Keep the upload as full-replace (already works), add a separate `POST /api/projects/:id/tasks` that *appends* a single task. UI distinction is clear: "Upload tasks" button vs "+ Add task" row.
**Why:** Preserves the documented flow ("re-import with corrected codes") while addressing the new ask.

## D8 — Show recent time entries default window
**Context:** Today the entries table is gated behind invoice-period selection.
**Decision:** Default to showing entries from `start_date` of the project → today (or last 90 days if start_date null). Period filter remains optional, scoped to invoice generation.
**Why:** "Show all from project start" matches what a user expects to see when they open the page.

## D9 — User profile update endpoint
**Context:** No existing endpoint to update `users.full_name` etc.
**Decision:** Add `PATCH /api/auth/me`; allow `full_name` only (email/role changes are admin operations).
**Why:** Smallest safe surface for 17.D.

## D10 — Logo column for orgs
**Context:** `organizations.logo_url` already exists as a string. Saving uploads to it.
**Decision:** Use existing column. Store relative path `/uploads/logos/<orgId>.<ext>` so it's directly usable by `<img>` in the SPA (proxied by Vite).
**Why:** No schema change needed.
