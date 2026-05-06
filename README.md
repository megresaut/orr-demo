# ORR — Operation, Resource, Revenue (MVP)

Multi-tenant SaaS skeleton derived from the Cosmos AMQ integration POC, generalized
per the Integr8Works deck (`Operra360` / ORR). MVP scope:

- Self-serve **org signup** + 7-day trial (no Stripe yet)
- **Excel-only data ingestion**:
  - Project onboarding workbook (slide 24) → project + client + rates
  - Project task template (slide 25) → tasks with budget/billing
  - Employee project time template (slide 26) → time entries
- **Invoice generation** with overhead multiplier + profit %, XLSX + PDF, optional email
- **Per-tenant branding** (company name, logo, address on invoices)
- **Connector picker** UI (Asana/Trello/Minute7/Deputy/QB/Xero/Wave shown but only Excel is wired)
- **Analytics**: portfolio summary, per-project burn-up, resource utilization
- **Dunning banner** for tenants without CC on file (25th–30th of month)

Not in MVP: Stripe billing, Asana/Minute7/QuickBooks/Wave/etc. live integrations,
plan-tier enforcement, Asana-style chart libraries (we ship raw burn-up data — wire a chart in v2).

## Repo layout

```
orr/
├── backend/                 Node + Express + Postgres
│   ├── server.js
│   ├── db.js
│   ├── migrations/
│   │   └── 001_init.sql
│   ├── scripts/migrate.js
│   ├── controllers/
│   ├── routes/
│   ├── services/
│   │   ├── excelProjectService.js     ← parses onboarding + task templates
│   │   ├── excelTimesheetService.js   ← parses employee project time template
│   │   ├── pdfService.js              ← Puppeteer PDF (HTML fallback if unavailable)
│   │   └── emailService.js            ← SMTP (no-op if unconfigured)
│   ├── middleware/auth.js
│   └── utils/
│       ├── invoiceBuilder.js          ← line-item + overhead/profit math
│       └── invoiceSeq.js              ← invoice number bumping
└── frontend/                Vite + React
    └── src/pages/{AuthPage,Dashboard,Projects,NewProject,ProjectDetail,Invoices,Settings,OrgProfile}
```

## Local setup

### 1) Postgres

```sh
createdb orr
createuser orr -P    # set password 'orr' to match defaults
psql orr -c "GRANT ALL ON DATABASE orr TO orr;"
```

### 2) Backend

```sh
cd backend
cp .env.example .env       # adjust DB creds, JWT_SECRET, optional SMTP
npm install
npm run migrate            # applies migrations/001_init.sql
npm run dev                # http://localhost:5060
```

### 3) Frontend

```sh
cd frontend
npm install
npm run dev                # http://localhost:5173
```

The frontend dev server proxies `/api/*` to `http://localhost:5060`.

## Quick smoke test

1. Open http://localhost:5173, click **Start 7-day trial**, create an org.
2. **Company** → fill in name/email/address (shown on invoices).
3. **Settings** → confirm Excel is selected for all three connector layers.
4. **Projects → New project**:
   - Either upload an OpeRRa360 onboarding workbook, or fill the manual form.
5. Open the project, upload a **task template** and a **timesheet**.
6. Pick a period and click **Preview** → **Generate** (or **Generate & email** if SMTP is set).
7. **Invoices** lists the invoice with links to the .xlsx and .pdf, and a "Mark paid" button.

## How the Excel parsers work

- **Onboarding** (`services/excelProjectService.js#parseProjectOnboarding`) anchors on the
  section headers `Project Information`, `Client Information`, `Project Timeline`,
  `Proposal Information`, `Resources and Labor` and reads the first non-`Eg.` row beneath each.
- **Tasks** (`parseProjectTasks`) auto-detects columns by header label (`Task Name`,
  `Section/Column`/`Task Code`, `Budget Hrs`, `Billed Hrs`, `Billing Rate`, etc.) so
  small label drift in a customer's copy still works.
- **Timesheet** (`parseTimesheet`) reads `Date / StartTime / EndTime / ResourceName /
  ResourceTaskDescription` rows. Hours = end − start, with a fallback to the `-Nhr-`
  fragment embedded in the description (slide 26 format). Task code is extracted from
  the first dotted code in the description (`16001-04-2026-1.01.02-…` → `1.01.02`).

## Invoice math

`utils/invoiceBuilder.js`:

```
subtotal      = Σ line.amount       where line.amount = hours × rate
afterOverhead = subtotal × overhead_multiplier   (default 1.66)
overhead      = afterOverhead − subtotal
profit        = afterOverhead × profit_pct/100  (default 10%)
total         = afterOverhead + profit
```

Rate selection per line:
1. If the timesheet line has a `task_code` and that task has a `billing_rate`, use it.
2. Else look up the resource name in the project's labor rates.
3. Else fall back to the project's first labor rate.

## What's stubbed for the deck but not wired

- **Stripe** trial → auto-charge: `organizations.cc_on_file` field exists, dunning
  banner endpoint exists; no Stripe SDK yet.
- **Plan tier enforcement** (slide 8 limits): `organizations.plan_tier` is stored,
  no quota checks.
- **3rd-party connectors**: connector preference is stored
  (`pm_connector` / `time_connector` / `acct_connector`); the Settings UI shows the
  catalog but only `excel` is functional. Each connector layer is a clear seam for
  adding `asanaService` / `minute7Service` / `quickbooksService` later.
- **Per-tenant logo**: stored as `logo_url` (string). Upload-and-store-in-S3
  is roadmap.

## Roadmap pointers (from slide 10)

- 2026 H1 — multi-tenant generalisation (this scaffold) + Stripe trial billing
- 2026 H2 — Wave connector + tech-partner download channels for Asana / Minute7 / QB
- 2027 — Trello / Deputy / Xero connectors

## Source

Forked from `cosmos/amq_integration_api` and rewritten around an Excel-first,
multi-tenant data model. The original Asana / Minute7 / QuickBooks services
remain in that repo if you want to port them over as second-class connectors.
