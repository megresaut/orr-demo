# OpeRRa: Operation, Resource, Revenue

**Project billing for professional-services firms: from spreadsheets to finished invoices.**

OpeRRa (ORR) turns the spreadsheets a services firm already keeps into **client-ready invoices and live project financials**. Those spreadsheets are project setup sheets, task budgets, and employee timesheets. Upload the workbooks, and OpeRRa builds the project and tracks hours against budget. It also applies the firm's overhead and profit rates, then produces branded invoices as Excel and PDF, ready to email.

It's a multi-tenant SaaS. Each firm signs up, brands its own workspace, and manages its own projects.

---

## The problem

Firms that bill by the hour against project budgets (engineering, architecture, consulting) usually run billing out of a pile of Excel files:
- one sheet to set up the project,
- one for the task budget,
- a timesheet per employee,
- a manual calculation each period to apply rates, overhead, and markup.

Answering "how much of the budget have we burned?" or "what do we invoice this month?" means stitching those together by hand. OpeRRa does that stitching.

## What it does

### Projects from a spreadsheet
- **Project onboarding workbook → project.** Upload the firm's standard onboarding workbook. OpeRRa reads the project information, client, timeline, proposal, and labor rates, and creates the project. A manual form is also available.
- **Task template → task budget.** Upload the task sheet to load every task with its code, budgeted hours, and billing rate. Column detection is flexible, so a client's slightly edited copy of the template still imports. Tasks can be added one at a time later without re-uploading.
- **Lump-sum projects** are supported alongside hourly ones.
- Projects can be edited, soft-deleted, and restored.

### Time tracking from timesheets
- Upload an **employee timesheet** and each row becomes a time entry.
- Hours come from start and end times, with a fallback to the hours written in the description.
- Entries are matched to tasks by the task code in the description (e.g. `1.01.02`).

### Live project financials
On each project page:
- budget vs. actual by task,
- project total with overhead and profit applied,
- invoiced to date,
- variance at completion.

Across all projects:
- a **portfolio dashboard** with KPIs and charts,
- per-project **burn-up**,
- **resource utilization**.

### Invoice generation
- Pick a billing period, **preview** the invoice, then **generate** it.
- Rates come from the task's billing rate if it has one, otherwise the employee's labor rate.
- Totals apply the firm's **overhead multiplier** and **profit percentage**:

  ```
  subtotal  = Σ hours × rate
  overhead  = subtotal × (overhead_multiplier − 1)     default multiplier 1.66
  profit    = (subtotal + overhead) × profit_pct       default 10%
  total     = subtotal + overhead + profit
  ```

- Output is **Excel and PDF**, branded with the firm's logo, name, and address. Invoices can be emailed straight to the client.
- Invoices are numbered automatically, and the Invoices page tracks each one's status, including **mark as paid**.

### Workspace & account
- **Self-serve signup** with a 7-day trial.
- Per-firm **branding**: logo, company name, address, and bill-to details.
- User profile and password reset.
- **Mobile access via QR code**: scan to open your workspace on a phone.
- **Connector catalog** in Settings showing project management, time tracking, and accounting connections (Asana, Trello, Minute7, Deputy, QuickBooks, Xero, Wave). **Excel is the only one wired up today**; the rest are on the roadmap.

## Roadmap

| When | What |
|---|---|
| Now | Multi-tenant platform with Excel-first ingestion (this repo) |
| Next | Stripe trial-to-paid billing and plan limits (a card-on-file field and a dunning banner already exist) |
| Later | Live connectors: Wave, Asana, Minute7, QuickBooks, then Trello, Deputy, Xero |

## Tech

- **Backend:** Node.js, Express, PostgreSQL. Excel parsing for the three templates. Puppeteer for PDF invoices. SMTP for email.
- **Frontend:** React and Vite, with Recharts for analytics.
- **Hosting:** Docker on Railway (`railway.json`).
- Derived from the Cosmos AMQ integration proof of concept and rebuilt around an Excel-first, multi-tenant data model. `DECISIONS.md` records product decisions made during client testing.

---

## Setup

Requires Node 20+ and PostgreSQL.

```bash
createdb orr && createuser orr -P            # password 'orr' matches the defaults

cd backend && cp .env.example .env           # DB creds, JWT_SECRET, optional SMTP
npm install && npm run migrate && npm run dev   # http://localhost:5060

cd ../frontend && npm install && npm run dev    # http://localhost:5173 (proxies /api)
```

Then open the app, start a trial, fill in your company profile, and create a project from an onboarding workbook. Upload a task template and a timesheet, then generate an invoice.
