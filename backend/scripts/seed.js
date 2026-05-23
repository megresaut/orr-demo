// scripts/seed.js — populate a demo org + projects + tasks + time entries + invoices.
// Login: demo@orr.local / demo1234
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');
const dbPromise = require('../db');
const { buildInvoicePayload, writeInvoiceXlsx } = require('../utils/invoiceBuilder');
const { renderInvoicePdf } = require('../services/pdfService');
const { bumpNumbers } = require('../utils/invoiceSeq');

const INVOICE_DIR = path.join(__dirname, '..', 'invoices');
fs.mkdirSync(INVOICE_DIR, { recursive: true });

const DEMO_EMAIL = 'demo@orr.local';
const DEMO_PASSWORD = 'demo1234';
const DEMO_ORG_NAME = 'MyBestEnggFirm Inc';

const today = new Date();
const iso = d => d.toISOString().slice(0, 10);
const daysAgo = n => { const d = new Date(today); d.setDate(d.getDate() - n); return d; };

const PROJECTS = [
  {
    // Sourced from OpeRRA360-Construction Project_OnboardingTemplate.xlsx
    name: 'PA Washington County Road Design Support',
    code: '16001-04-2026',
    location: 'McMurray, PA',
    description: 'Re: US 19 project work between McMurray and Canonsburg, PA',
    start_date: '2026-04-01',
    end_date: '2026-07-31',
    client_name: 'Washington County PWD',
    client_contact: 'Ms. Mary Pope',
    client_email: 'invoices@pwdwashington.com',
    client_phone: '4999999999',
    client_address: '999 Emanuel St, Canonsburg, PA 15317',
    contract_amount: 99416.80,
    allowance: 0,
    overhead_multiplier: 1.66,
    profit_pct: 10,
    invoice_seq: 'WashCty_Cons_01',
    rates: [
      { role: 'Project Manager', name: 'Andrew Carnegie', rate: 85.99 },
      { role: 'Senior Engineer', name: 'Jane Josephine', rate: 59.01 },
      { role: 'Civil Associate', name: 'Oprah Belgium', rate: 49.91 },
      { role: 'Civil Designer', name: 'Anthony Gaudi', rate: 37.09 },
      { role: 'Accountant', name: 'Ludwig', rate: 29.01 },
    ],
    tasks: [
      { task_code: '1.01', task_name: 'Project Site Preliminary Walkthrough', assignee_name: 'Andrew Carnegie', start_date: '2026-04-03', due_date: '2026-04-07', budget_hours: 2, billing_rate: 85.99 },
      { task_code: '1.01.02', task_name: 'Project Site Preliminary Walkthrough — Engineering Team', assignee_name: 'Jane Josephine', start_date: '2026-04-01', due_date: '2026-04-03', budget_hours: 4, billing_rate: 59.01 },
      { task_code: '1.01.03', task_name: 'Project Site Pre-Initiation Final Walkthrough', assignee_name: 'Andrew Carnegie', start_date: '2026-04-07', due_date: '2026-04-10', budget_hours: 1, billing_rate: 85.99 },
      { task_code: '2.01', task_name: 'Project Preliminary Design', assignee_name: 'Andrew Carnegie', start_date: '2026-04-10', due_date: '2026-04-30', budget_hours: 5, billing_rate: 85.99 },
      { task_code: '2.01.01', task_name: 'Project Preliminary Civil Design and Drafting (CAD)', assignee_name: 'Anthony Gaudi', start_date: '2026-04-10', due_date: '2026-04-24', budget_hours: 15, billing_rate: 37.09 },
      { task_code: '2.01.02', task_name: 'Project Preliminary Civil Design and Drafting (Review)', assignee_name: 'Oprah Belgium', start_date: '2026-04-16', due_date: '2026-04-26', budget_hours: 10, billing_rate: 49.91 },
      { task_code: '2.01.03', task_name: 'Preliminary Design Final Review Sign-off', assignee_name: 'Mary Pope', start_date: '2026-04-26', due_date: '2026-04-30', budget_hours: 1, billing_rate: 0 },
      { task_code: '2.02', task_name: 'Final Sign off with County', assignee_name: 'Andrew Carnegie', start_date: '2026-04-30', due_date: '2026-04-30', budget_hours: 5, billing_rate: 85.99 },
      { task_code: '2.03', task_name: 'Invoicing and Accounting', assignee_name: 'Andrew Carnegie', start_date: '2026-05-01', due_date: '2026-05-05', budget_hours: 3, billing_rate: 85.99 },
      { task_code: '2.04', task_name: 'Project Excavation Work', assignee_name: 'Jane Josephine', start_date: '2026-05-01', due_date: '2026-05-20', budget_hours: 40, billing_rate: 59.01 },
    ],
    // Time entries from the template's timesheet sheet (Apr 3–10, 2026; ~32–25 days before 2026-05-05)
    time: [
      { day: 32, resource: 'Andrew Carnegie', task_code: '1.01', hours: 1, desc: '16001-04-2026-1.01-1hr-Personally walked the site' },
      { day: 28, resource: 'Andrew Carnegie', task_code: '1.01', hours: 1, desc: '16001-04-2026-1.01-1hr-Personally walked the site (follow-up)' },
      { day: 28, resource: 'Jane Josephine', task_code: '1.01.02', hours: 2, desc: '16001-04-2026-1.01.02-2hrs-Walked with engineering team' },
      { day: 25, resource: 'Jane Josephine', task_code: '1.01.02', hours: 1, desc: '16001-04-2026-1.01.02-1hr-Continued walkthrough' },
      { day: 25, resource: 'Andrew Carnegie', task_code: '1.01.03', hours: 1, desc: '16001-04-2026-1.01.03-1hr-Pre-initiation walkthrough' },
      { day: 25, resource: 'Jane Josephine', task_code: '1.01.02', hours: 1, desc: '16001-04-2026-1.01.02-1hr-Final walkthrough' },
    ],
    invoices: [
      { period_days: [35, 0], status: 'paid' },
    ],
  },
  {
    name: 'CMU Campus Stormwater Master Plan',
    code: 'CMU-STM-01-2025',
    location: 'Pittsburgh, PA',
    description: 'Carnegie Mellon University — campus-wide stormwater master plan & green infrastructure assessment',
    start_date: iso(daysAgo(200)),
    end_date: iso(daysAgo(-30)),
    client_name: 'Carnegie Mellon University — Facilities Management Services',
    client_contact: 'Dr. Patricia Lin',
    client_email: 'plin@andrew.cmu.edu',
    client_phone: '4125558821',
    client_address: '5000 Forbes Ave, Pittsburgh, PA 15213',
    contract_amount: 78250.00,
    allowance: 2500,
    overhead_multiplier: 1.66,
    profit_pct: 10,
    invoice_seq: 'CMU_STM_01',
    rates: [
      { role: 'Project Manager', name: 'Priya Anand', rate: 135.00 },
      { role: 'Senior Engineer', name: 'Marcus Holloway', rate: 98.00 },
      { role: 'Civil Associate', name: 'Lin Zhao', rate: 72.00 },
      { role: 'Civil Designer', name: 'Devin Park', rate: 58.00 },
      { role: 'Accountant', name: 'Helena Voss', rate: 46.00 },
    ],
    tasks: [
      { task_code: '1.01', task_name: 'Outfall Survey Walkthrough', assignee_name: 'Priya Anand', budget_hours: 3, billing_rate: 135.00 },
      { task_code: '1.01.02', task_name: 'Outfall Survey w/ GIS Team', assignee_name: 'Marcus Holloway', budget_hours: 6, billing_rate: 98.00 },
      { task_code: '1.01.03', task_name: 'Pre-Modeling Site Verification', assignee_name: 'Priya Anand', budget_hours: 2, billing_rate: 135.00 },
      { task_code: '2.01', task_name: 'Hydrologic Modeling Phase Kickoff', assignee_name: 'Priya Anand', budget_hours: 6, billing_rate: 135.00 },
      { task_code: '2.01.01', task_name: 'SWMM Subcatchment Build', assignee_name: 'Marcus Holloway', budget_hours: 18, billing_rate: 98.00 },
      { task_code: '2.01.02', task_name: 'SWMM Calibration & Validation', assignee_name: 'Marcus Holloway', budget_hours: 12, billing_rate: 98.00 },
      { task_code: '2.01.03', task_name: 'Modeling QC Review Sign-off', assignee_name: 'Priya Anand', budget_hours: 2, billing_rate: 135.00 },
      { task_code: '2.02', task_name: 'GI Concept Workshop with University', assignee_name: 'Priya Anand', budget_hours: 4, billing_rate: 135.00 },
      { task_code: '2.03', task_name: 'Invoicing and Reporting', assignee_name: 'Helena Voss', budget_hours: 3, billing_rate: 46.00 },
      { task_code: '2.04', task_name: 'Master Plan Final Documentation', assignee_name: 'Lin Zhao', budget_hours: 35, billing_rate: 72.00 },
    ],
    time: [
      { day: 150, resource: 'Priya Anand', task_code: '1.01', hours: 3, desc: 'CMU-STM-01-2025-1.01-3hrs-Outfall walkthrough — east campus' },
      { day: 148, resource: 'Marcus Holloway', task_code: '1.01.02', hours: 6, desc: 'CMU-STM-01-2025-1.01.02-6hrs-Outfall mapping with GIS' },
      { day: 140, resource: 'Priya Anand', task_code: '1.01.03', hours: 2, desc: 'CMU-STM-01-2025-1.01.03-2hrs-Pre-modeling site check' },
      { day: 130, resource: 'Marcus Holloway', task_code: '2.01.01', hours: 8, desc: 'CMU-STM-01-2025-2.01.01-8hrs-Subcatchment delineation' },
      { day: 125, resource: 'Marcus Holloway', task_code: '2.01.01', hours: 8, desc: 'CMU-STM-01-2025-2.01.01-8hrs-Subcatchment parameter import' },
      { day: 120, resource: 'Marcus Holloway', task_code: '2.01.02', hours: 8, desc: 'CMU-STM-01-2025-2.01.02-8hrs-Calibration run A — 2-yr storm' },
      { day: 100, resource: 'Lin Zhao', task_code: '2.04', hours: 6, desc: 'CMU-STM-01-2025-2.04-6hrs-Final report draft sections' },
    ],
    invoices: [
      { period_days: [160, 90], status: 'paid' },
    ],
  },
  {
    name: 'Mt. Andes',
    code: '643-02-2025',
    location: 'Pittsburgh, PA',
    description: '3C Site Civil — firing range site/civil work',
    start_date: iso(daysAgo(60)),
    end_date: iso(daysAgo(-180)),
    client_name: 'Atlas Technical Consultants',
    client_contact: 'Maria Alvarez',
    client_email: 'malvarez@atlas-consulting.example',
    client_phone: '4125550143',
    client_address: '500 Forbes Ave, Pittsburgh, PA 15219',
    contract_amount: 82400.00,
    allowance: 3000,
    overhead_multiplier: 1.66,
    profit_pct: 10,
    invoice_seq: 'AT_643_01',
    rates: [
      { role: 'Project Manager', name: 'Mariah Chen', rate: 124.50 },
      { role: 'Senior Engineer', name: 'Devin Park', rate: 87.00 },
      { role: 'Civil Associate', name: 'Robert Kim', rate: 65.00 },
      { role: 'Civil Designer', name: 'Sasha Patel', rate: 48.00 },
      { role: 'Accountant', name: 'Eleanor Reyes', rate: 32.00 },
    ],
    tasks: [
      { task_code: '1.01', task_name: 'Site Investigation Walkthrough', assignee_name: 'Mariah Chen', budget_hours: 4, billing_rate: 124.50 },
      { task_code: '1.01.02', task_name: 'Soil Observation w/ Geotech Team', assignee_name: 'Devin Park', budget_hours: 6, billing_rate: 87.00 },
      { task_code: '1.01.03', task_name: 'Pre-Design Hazards Walkthrough', assignee_name: 'Mariah Chen', budget_hours: 2, billing_rate: 124.50 },
      { task_code: '2.01', task_name: 'Grading & Drainage Concept', assignee_name: 'Mariah Chen', budget_hours: 6, billing_rate: 124.50 },
      { task_code: '2.01.01', task_name: 'CAD Production — Base Sheets', assignee_name: 'Sasha Patel', budget_hours: 16, billing_rate: 48.00 },
      { task_code: '2.01.02', task_name: 'CAD Production — Plan Set', assignee_name: 'Sasha Patel', budget_hours: 24, billing_rate: 48.00 },
      { task_code: '2.01.03', task_name: 'Plan Review Sign-off', assignee_name: 'Mariah Chen', budget_hours: 2, billing_rate: 124.50 },
      { task_code: '2.02', task_name: 'Final Sign off with City', assignee_name: 'Mariah Chen', budget_hours: 3, billing_rate: 124.50 },
      { task_code: '2.03', task_name: 'Invoicing and Accounting', assignee_name: 'Eleanor Reyes', budget_hours: 2, billing_rate: 32.00 },
      { task_code: '2.04', task_name: 'Construction Administration', assignee_name: 'Robert Kim', budget_hours: 18, billing_rate: 65.00 },
    ],
    time: [
      { day: 50, resource: 'Mariah Chen', task_code: '1.01', hours: 4, desc: '643-02-2025-1.01-4hrs-Site investigation walkthrough' },
      { day: 48, resource: 'Devin Park', task_code: '1.01.02', hours: 6, desc: '643-02-2025-1.01.02-6hrs-Soil observation with geotech' },
      { day: 40, resource: 'Mariah Chen', task_code: '2.01', hours: 6, desc: '643-02-2025-2.01-6hrs-Grading concept' },
      { day: 35, resource: 'Sasha Patel', task_code: '2.01.01', hours: 8, desc: '643-02-2025-2.01.01-8hrs-CAD base sheets' },
      { day: 30, resource: 'Sasha Patel', task_code: '2.01.01', hours: 8, desc: '643-02-2025-2.01.01-8hrs-CAD layer setup' },
      { day: 25, resource: 'Sasha Patel', task_code: '2.01.02', hours: 8, desc: '643-02-2025-2.01.02-8hrs-Plan production' },
      { day: 20, resource: 'Sasha Patel', task_code: '2.01.02', hours: 6, desc: '643-02-2025-2.01.02-6hrs-Plan revisions' },
    ],
    invoices: [],
  },
];

(async () => {
  const db = await dbPromise;

  // ---- Tenant + admin user
  let orgId;
  const existingUser = await db.query('SELECT id, org_id FROM users WHERE email = $1', [DEMO_EMAIL]);
  if (existingUser.rows.length) {
    orgId = existingUser.rows[0].org_id;
    console.log(`[seed] using existing demo org ${orgId}`);
    // Wipe its data so re-running gives a clean state
    await db.query('DELETE FROM invoices WHERE org_id = $1', [orgId]);
    await db.query('DELETE FROM time_entries WHERE org_id = $1', [orgId]);
    await db.query('DELETE FROM project_tasks WHERE org_id = $1', [orgId]);
    await db.query('DELETE FROM project_rates WHERE org_id = $1', [orgId]);
    await db.query('DELETE FROM projects WHERE org_id = $1', [orgId]);
  } else {
    const trial = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const orgRes = await db.query(
      `INSERT INTO organizations (name, slug, logo_url, address, phone, contact_email,
                                  plan_tier, trial_ends_at, cc_on_file)
       VALUES ($1, $2, NULL, $3, $4, $5, 'professional', $6, FALSE) RETURNING id`,
      [
        DEMO_ORG_NAME, 'mybestenggfirm-' + Date.now(),
        '20001 Engineers Dr, Washington, PA 15301',
        '7245550100', 'president@mybestenggfirm.example',
        trial,
      ]
    );
    orgId = orgRes.rows[0].id;
    const hash = await bcrypt.hash(DEMO_PASSWORD, 10);
    await db.query(
      `INSERT INTO users (org_id, email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4, 'admin')`,
      [orgId, DEMO_EMAIL, hash, 'Demo Admin']
    );
    console.log(`[seed] created demo org ${orgId} + user ${DEMO_EMAIL}`);
  }

  // ---- Projects
  for (const p of PROJECTS) {
    const projRes = await db.query(
      `INSERT INTO projects
        (org_id, name, code, location, description, start_date, end_date,
         client_name, client_contact, client_email, client_phone, client_address,
         contract_amount, allowance, overhead_multiplier, profit_pct, invoice_seq)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        orgId, p.name, p.code, p.location, p.description, p.start_date, p.end_date,
        p.client_name, p.client_contact, p.client_email, p.client_phone, p.client_address,
        p.contract_amount, p.allowance, p.overhead_multiplier, p.profit_pct, p.invoice_seq,
      ]
    );
    const project = projRes.rows[0];

    for (const r of p.rates) {
      await db.query(
        `INSERT INTO project_rates (org_id, project_id, role, name, rate)
         VALUES ($1, $2, $3, $4, $5)`,
        [orgId, project.id, r.role, r.name, r.rate]
      );
    }
    for (const t of p.tasks) {
      await db.query(
        `INSERT INTO project_tasks
          (org_id, project_id, task_code, task_name, assignee_name,
           start_date, due_date, budget_hours, billing_rate)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [orgId, project.id, t.task_code, t.task_name, t.assignee_name || null,
         t.start_date || null, t.due_date || null,
         t.budget_hours || 0, t.billing_rate || 0]
      );
    }
    for (const e of p.time) {
      await db.query(
        `INSERT INTO time_entries
          (org_id, project_id, task_code, entry_date, hours, resource_name, description, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'excel')`,
        [orgId, project.id, e.task_code, iso(daysAgo(e.day)), e.hours, e.resource, e.desc]
      );
    }

    // Generate invoices
    let invoiceSeq = project.invoice_seq;
    let runningDelivered = 0;
    const orgRow = (await db.query('SELECT * FROM organizations WHERE id = $1', [orgId])).rows[0];

    for (const inv of p.invoices) {
      const periodStart = iso(daysAgo(inv.period_days[0]));
      const periodEnd = iso(daysAgo(inv.period_days[1]));

      const ratesRes = await db.query(`SELECT role, name, rate FROM project_rates WHERE project_id = $1`, [project.id]);
      const tasksRes = await db.query(`SELECT * FROM project_tasks WHERE project_id = $1`, [project.id]);
      const entriesRes = await db.query(
        `SELECT * FROM time_entries WHERE project_id = $1 AND entry_date BETWEEN $2 AND $3 ORDER BY entry_date`,
        [project.id, periodStart, periodEnd]
      );
      if (!entriesRes.rows.length) continue;

      const payload = buildInvoicePayload({
        project, rates: ratesRes.rows, tasks: tasksRes.rows, entries: entriesRes.rows,
      });
      const invoiceNumber = invoiceSeq;
      const xlsxPath = await writeInvoiceXlsx(payload, invoiceNumber, INVOICE_DIR);
      const pdfPath = path.join(INVOICE_DIR, `${invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`);
      try {
        await renderInvoicePdf({
          org: orgRow, project, invoiceNumber,
          period: { start: periodStart, end: periodEnd }, payload,
        }, pdfPath);
      } catch (e) {
        console.warn('[seed] PDF render skipped:', e.message);
      }

      const status = inv.status || 'draft';
      const sentAt = status === 'sent' || status === 'paid' ? new Date() : null;
      const paidAt = status === 'paid' ? new Date() : null;

      await db.query(
        `INSERT INTO invoices
          (org_id, project_id, invoice_number, period_start, period_end,
           subtotal, overhead, profit, total, status, pdf_path, xlsx_path, payload, sent_at, paid_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          orgId, project.id, invoiceNumber, periodStart, periodEnd,
          payload.subtotal, payload.overhead, payload.profit, payload.total, status,
          fs.existsSync(pdfPath) ? path.relative(path.join(__dirname, '..'), pdfPath) : null,
          path.relative(path.join(__dirname, '..'), xlsxPath),
          payload, sentAt, paidAt,
        ]
      );

      runningDelivered += Number(payload.total);
      invoiceSeq = bumpNumbers(invoiceSeq);
    }

    await db.query(
      `UPDATE projects SET invoice_seq = $1, total_services_to_date = $2, updated_at = NOW() WHERE id = $3`,
      [invoiceSeq, runningDelivered, project.id]
    );
    console.log(`[seed] project "${project.name}" — ${p.tasks.length} tasks, ${p.time.length} entries, ${p.invoices.length} invoices`);
  }

  console.log('\n[seed] done.');
  console.log(`       Login at http://localhost:9100`);
  console.log(`       Email:    ${DEMO_EMAIL}`);
  console.log(`       Password: ${DEMO_PASSWORD}`);
  process.exit(0);
})().catch(err => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
