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

## D11 — Bug 1 "Project total with Overhead and Profit" row was a stale Railway deploy
**Context:** Client reported the second total row missing from the Tasks card on Project Detail.
**Decision:** No code change. Source at `frontend/src/pages/ProjectDetail.jsx:603-608` already renders the row as an unconditional sibling of the "Project total" row inside the same `taskTree.length ? …` block — identical styling, same `<tbody>`, both wrapped in `useMemo`-derived numbers. Static analysis rules out a render-time miss. The deployed Railway bundle predates the row.
**Why:** A redeploy resolves it; introducing changes would muddy the fix for the other three bugs in the same commit.

## D12 — Variance @ completion now subtracts invoiced-to-date
**Context:** Previous formula `contract − loaded WIP` ignored money already billed, understating variance on projects with past invoices.
**Decision:** Run a separate `SELECT SUM(total) FROM invoices WHERE project_id = $1` (all statuses — draft + sent + paid) and subtract that alongside loaded WIP. Did not touch `projects.total_services_to_date` (unreliable per analyticsController.portfolio comments and the brief). Added `invoiced_to_date` to the KPI payload; renamed nothing.
**Why:** Single source of truth for billed amounts; existing frontend reads `variance_at_completion` and continues to work without changes.

## D13 — `??` instead of `||` for overhead_multiplier / profit_pct fallbacks
**Context:** `Number(project.profit_pct || 10)` clobbers a saved value of 0 — invoices kept showing the 10% profit row even after the user set profit to 0.
**Decision:** Switched all backend fallbacks (analyticsController, invoiceBuilder, pdfService HTML, projectController insert, uploadController) to `??`. Also made the PDF/xlsx invoice templates conditionally omit the Overhead row when multiplier === 1 and the Profit row when pct === 0. Frontend `EditProject` already handles blank-as-zero via `Number.isFinite`.
**Why:** `??` preserves explicit zero; `||` does not. Per the brief, frontend ProjectDetail's display fallbacks were left untouched (out of scope for this sprint).

## D14 — Deleted projects moved to sidebar
**Context:** Inline "View N deleted" link on Dashboard was easy to miss and only appeared when count > 0.
**Decision:** Added `Deleted projects` `NavLink` to the Shell sidebar (after Company); removed the inline link from Dashboard. Skipped the optional sidebar count badge per the brief — would have required pulling portfolio data in `App.jsx` just for that.
**Why:** Sidebar is the single discoverable entry point; matches treatment of other top-level routes.

## D15 — Lumpsum implemented as a display flag, not a separate billing path
**Context:** Lumpsum projects bill at a flat amount per task; the documented user flow is "1 hour × lumpsum_amount" per task, so the existing time-entry × rate math already produces the right subtotal. The only thing that needs to change is what shows up on the invoice.
**Decision:** Added `projects.is_lumpsum` (boolean, default false). Server forces `overhead_multiplier=1` / `profit_pct=0` on create/update when the flag is true. `buildInvoicePayload` nulls out per-line `hours` and `unit_price` when lumpsum so the PDF renders "—" (xlsx leaves them blank naturally). The existing `overhead_multiplier !== 1` / `profit_pct !== 0` guards on the totals block already hide the Overhead/Profit rows for lumpsum invoices — no additional branching needed there.
**Why:** Smallest possible change; preserves utilization/burn-up analytics which depend on the "1 hour × amount" entry pattern. Adding a separate `lumpsum_amount` column on tasks or a parallel billing path would have rippled into analytics, time-entry UI, and the invoice math for no behavioral gain.
