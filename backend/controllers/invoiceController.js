// controllers/invoiceController.js — generate, list, view, send invoices.
const fs = require('fs');
const path = require('path');
const dbPromise = require('../db');
const { buildInvoicePayload, writeInvoiceXlsx } = require('../utils/invoiceBuilder');
const { bumpNumbers } = require('../utils/invoiceSeq');
const { renderInvoicePdf, renderInvoicePdfBuffer } = require('../services/pdfService');
const { sendEmail } = require('../services/emailService');

const INVOICE_DIR = path.join(__dirname, '..', 'invoices');
fs.mkdirSync(INVOICE_DIR, { recursive: true });

async function loadProjectBundle(db, orgId, projectId, periodStart, periodEnd) {
  const projRes = await db.query(`SELECT * FROM projects WHERE id = $1 AND org_id = $2`, [projectId, orgId]);
  const project = projRes.rows[0];
  if (!project) return null;

  const ratesRes = await db.query(`SELECT role, name, rate FROM project_rates WHERE project_id = $1`, [projectId]);
  const tasksRes = await db.query(`SELECT * FROM project_tasks WHERE project_id = $1`, [projectId]);
  const entriesRes = await db.query(
    `SELECT * FROM time_entries
       WHERE project_id = $1 AND entry_date BETWEEN $2 AND $3
       ORDER BY entry_date`,
    [projectId, periodStart, periodEnd]
  );
  return {
    project,
    rates: ratesRes.rows,
    tasks: tasksRes.rows,
    entries: entriesRes.rows,
  };
}

exports.preview = async (req, res, next) => {
  try {
    const { projectId, startDate, endDate } = req.body || {};
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ error: 'projectId, startDate, endDate required' });
    }
    const db = await dbPromise;
    const bundle = await loadProjectBundle(db, req.orgId, projectId, startDate, endDate);
    if (!bundle) return res.status(404).json({ error: 'Project not found' });
    if (!bundle.entries.length) {
      return res.status(400).json({ error: 'No time entries in this period — upload a timesheet first.' });
    }
    const payload = buildInvoicePayload(bundle);
    res.json({ payload, period: { start: startDate, end: endDate } });
  } catch (err) { next(err); }
};

exports.previewPdf = async (req, res, next) => {
  try {
    const { projectId, startDate, endDate } = req.body || {};
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ error: 'projectId, startDate, endDate required' });
    }
    const db = await dbPromise;
    const bundle = await loadProjectBundle(db, req.orgId, projectId, startDate, endDate);
    if (!bundle) return res.status(404).json({ error: 'Project not found' });
    if (!bundle.entries.length) {
      return res.status(400).json({ error: 'No time entries in this period — log time first.' });
    }

    const orgRes = await db.query(`SELECT * FROM organizations WHERE id = $1`, [req.orgId]);
    const org = orgRes.rows[0];

    const payload = buildInvoicePayload(bundle);
    const previewNumber = bundle.project.invoice_seq || `${bundle.project.code || 'INV'}_PREVIEW`;

    let buf;
    try {
      buf = await renderInvoicePdfBuffer({
        org, project: bundle.project, invoiceNumber: previewNumber,
        period: { start: startDate, end: endDate }, payload,
      });
    } catch (err) {
      return res.status(500).json({ error: `PDF rendering failed: ${err.message}` });
    }

    const filename = `${(bundle.project.code || 'invoice').replace(/[^\w.-]+/g, '_')}-preview.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.setHeader('Content-Length', buf.length);
    res.end(buf);
  } catch (err) { next(err); }
};

exports.generate = async (req, res, next) => {
  try {
    const { projectId, startDate, endDate, send } = req.body || {};
    if (!projectId || !startDate || !endDate) {
      return res.status(400).json({ error: 'projectId, startDate, endDate required' });
    }
    const db = await dbPromise;
    const bundle = await loadProjectBundle(db, req.orgId, projectId, startDate, endDate);
    if (!bundle) return res.status(404).json({ error: 'Project not found' });
    if (!bundle.entries.length) return res.status(400).json({ error: 'No time entries in this period.' });

    const orgRes = await db.query(`SELECT * FROM organizations WHERE id = $1`, [req.orgId]);
    const org = orgRes.rows[0];

    const payload = buildInvoicePayload(bundle);
    const invoiceNumber = bundle.project.invoice_seq || `${bundle.project.code || 'INV'}_01`;
    const xlsxPath = await writeInvoiceXlsx(payload, invoiceNumber, INVOICE_DIR);
    const pdfPath = path.join(INVOICE_DIR, `${invoiceNumber.replace(/[^\w.-]+/g, '_')}.pdf`);
    await renderInvoicePdf({
      org, project: bundle.project, invoiceNumber,
      period: { start: startDate, end: endDate }, payload,
    }, pdfPath);

    await db.query('BEGIN');
    let invoice;
    try {
      const ins = await db.query(
        `INSERT INTO invoices (org_id, project_id, invoice_number, period_start, period_end,
                               subtotal, overhead, profit, total, status, pdf_path, xlsx_path, payload)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10,$11,$12) RETURNING *`,
        [
          req.orgId, projectId, invoiceNumber, startDate, endDate,
          payload.subtotal, payload.overhead, payload.profit, payload.total,
          fs.existsSync(pdfPath) ? path.relative(path.join(__dirname, '..'), pdfPath) : null,
          path.relative(path.join(__dirname, '..'), xlsxPath),
          payload,
        ]
      );
      invoice = ins.rows[0];

      // bump invoice sequence + accumulate total_services_to_date
      const nextSeq = bumpNumbers(invoiceNumber);
      await db.query(
        `UPDATE projects SET invoice_seq = $1,
                              total_services_to_date = COALESCE(total_services_to_date,0) + $2,
                              updated_at = NOW()
           WHERE id = $3`,
        [nextSeq, payload.total, projectId]
      );
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }

    let emailStatus = null;
    if (send) {
      const recipient = payload.client?.email || null;
      if (!recipient) {
        emailStatus = { sent: false, recipient: null, reason: 'no_client_email' };
      } else {
        const attachments = [];
        if (fs.existsSync(xlsxPath)) attachments.push({ filename: path.basename(xlsxPath), path: xlsxPath });
        if (fs.existsSync(pdfPath)) attachments.push({ filename: path.basename(pdfPath), path: pdfPath });
        const result = await sendEmail({
          to: recipient,
          subject: `Invoice ${invoiceNumber} from ${org.name}`,
          text: `Please find attached invoice ${invoiceNumber} for ${bundle.project.name}.\nTotal: $${payload.total.toFixed(2)}`,
          attachments,
        });
        if (result.sent) {
          await db.query(`UPDATE invoices SET status = 'sent', sent_at = NOW() WHERE id = $1`, [invoice.id]);
          invoice.status = 'sent';
        }
        emailStatus = { sent: result.sent, recipient, reason: result.reason || null };
      }
    }

    res.json({ invoice, payload, email: emailStatus });
  } catch (err) { next(err); }
};

exports.list = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT i.*, p.name AS project_name, p.code AS project_code
         FROM invoices i JOIN projects p ON p.id = i.project_id
        WHERE i.org_id = $1 ORDER BY i.created_at DESC`,
      [req.orgId]
    );
    res.json(rows);
  } catch (err) { next(err); }
};

exports.get = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT i.*, p.name AS project_name, p.code AS project_code
         FROM invoices i JOIN projects p ON p.id = i.project_id
        WHERE i.id = $1 AND i.org_id = $2`,
      [req.params.id, req.orgId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

exports.remove = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `SELECT id, project_id, total, pdf_path, xlsx_path FROM invoices
        WHERE id = $1 AND org_id = $2`,
      [req.params.id, req.orgId]
    );
    const inv = rows[0];
    if (!inv) return res.status(404).json({ error: 'Not found' });

    await db.query('BEGIN');
    try {
      await db.query(`DELETE FROM invoices WHERE id = $1 AND org_id = $2`, [inv.id, req.orgId]);
      // Roll back the running services-to-date so the project KPI stays accurate
      await db.query(
        `UPDATE projects
            SET total_services_to_date = GREATEST(0, COALESCE(total_services_to_date, 0) - $1),
                updated_at = NOW()
          WHERE id = $2 AND org_id = $3`,
        [Number(inv.total || 0), inv.project_id, req.orgId]
      );
      await db.query('COMMIT');
    } catch (e) { await db.query('ROLLBACK'); throw e; }

    // Best-effort cleanup of generated artifacts (don't fail the request if they're already gone)
    for (const rel of [inv.pdf_path, inv.xlsx_path]) {
      if (!rel) continue;
      const abs = path.join(__dirname, '..', rel);
      fs.unlink(abs, () => {});
    }
    res.json({ deleted: true });
  } catch (err) { next(err); }
};

exports.markPaid = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const { rows } = await db.query(
      `UPDATE invoices SET status = 'paid', paid_at = NOW()
        WHERE id = $1 AND org_id = $2 RETURNING *`,
      [req.params.id, req.orgId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
};

// Slide 12: 25th-30th of month, banner unpaid invoices for tenants without CC.
exports.dunningCheck = async (req, res, next) => {
  try {
    const db = await dbPromise;
    const orgRes = await db.query(`SELECT cc_on_file FROM organizations WHERE id = $1`, [req.orgId]);
    if (orgRes.rows[0]?.cc_on_file) return res.json({ banner: null });

    const day = new Date().getDate();
    if (day < 25) return res.json({ banner: null });

    const { rows } = await db.query(
      `SELECT id, invoice_number, total, period_end FROM invoices
        WHERE org_id = $1 AND status != 'paid' ORDER BY period_end ASC`,
      [req.orgId]
    );
    if (!rows.length) return res.json({ banner: null });
    res.json({
      banner: {
        unpaid_count: rows.length,
        unpaid_total: rows.reduce((s, r) => s + Number(r.total || 0), 0),
        invoices: rows,
      },
    });
  } catch (err) { next(err); }
};
