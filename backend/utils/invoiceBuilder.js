// utils/invoiceBuilder.js — build the invoice payload from time entries + rates.
const ExcelJS = require('exceljs');
const path = require('path');

function isoDate(d) {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  // Already YYYY-MM-DD or ISO datetime — take the first 10 chars
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? s : parsed.toISOString().slice(0, 10);
}

function rateForResource(resource, projectRates) {
  // Prefer name match; fall back to role match; fall back to first rate.
  if (!projectRates?.length) return 0;
  const exact = projectRates.find(r => r.name && r.name.toLowerCase() === String(resource || '').toLowerCase());
  if (exact) return Number(exact.rate);
  return Number(projectRates[0].rate);
}

/**
 * Group time entries by resource+task and compute line items.
 * Apply overhead multiplier to subtotal, then profit pct on top.
 */
function buildInvoicePayload({ project, rates, tasks, entries }) {
  const tasksByCode = new Map();
  for (const t of tasks || []) tasksByCode.set(t.task_code, t);

  const groups = new Map();
  for (const e of entries) {
    const key = `${e.resource_name}||${e.task_code || ''}`;
    if (!groups.has(key)) {
      groups.set(key, {
        resource_name: e.resource_name,
        task_code: e.task_code || null,
        task_name: tasksByCode.get(e.task_code)?.task_name || e.description || '',
        hours: 0,
        descriptions: new Set(),
        first_date: e.entry_date,
        last_date: e.entry_date,
      });
    }
    const g = groups.get(key);
    g.hours += Number(e.hours || 0);
    if (e.description) g.descriptions.add(e.description);
    if (e.entry_date < g.first_date) g.first_date = e.entry_date;
    if (e.entry_date > g.last_date) g.last_date = e.entry_date;
  }

  const isLumpsum = !!project.is_lumpsum;
  const lines = [];
  let subtotal = 0;
  for (const g of groups.values()) {
    // task-specific billing rate beats per-resource rate
    let unitPrice = 0;
    if (g.task_code && tasksByCode.get(g.task_code)?.billing_rate) {
      unitPrice = Number(tasksByCode.get(g.task_code).billing_rate);
    }
    if (!unitPrice) unitPrice = rateForResource(g.resource_name, rates);
    const amount = Math.round(g.hours * unitPrice * 100) / 100;
    subtotal += amount;
    // For lumpsum projects, hours/rate are internal-only — surface only the amount.
    lines.push({
      description: `${g.resource_name} — ${g.task_name || g.task_code || 'Work'} (${isoDate(g.first_date)} → ${isoDate(g.last_date)})`,
      task_code: g.task_code,
      resource_name: g.resource_name,
      hours: isLumpsum ? null : Math.round(g.hours * 100) / 100,
      unit_price: isLumpsum ? null : unitPrice,
      amount,
    });
  }

  // ?? (not ||) so an explicit zero for overhead/profit is preserved.
  const overheadMult = Number(project.overhead_multiplier ?? 1.66);
  const profitPct = Number(project.profit_pct ?? 10);
  const subtotalRounded = Math.round(subtotal * 100) / 100;
  const afterOverhead = Math.round(subtotalRounded * overheadMult * 100) / 100;
  const overhead = Math.round((afterOverhead - subtotalRounded) * 100) / 100;
  const profit = Math.round(afterOverhead * (profitPct / 100) * 100) / 100;
  const total = Math.round((afterOverhead + profit) * 100) / 100;

  return {
    project_id: project.id,
    project_name: project.name,
    project_code: project.code,
    is_lumpsum: isLumpsum,
    client: {
      name: project.client_name,
      contact: project.client_contact,
      email: project.client_email,
      address: project.client_address,
    },
    overhead_multiplier: overheadMult,
    profit_pct: profitPct,
    lines,
    subtotal: subtotalRounded,
    overhead,
    profit,
    total,
  };
}

async function writeInvoiceXlsx(payload, invoiceNumber, outDir) {
  const wb = new ExcelJS.Workbook();
  const sh = wb.addWorksheet('Invoice');
  sh.columns = [
    { header: 'Description', key: 'description', width: 50 },
    { header: 'Hours', key: 'hours', width: 10 },
    { header: 'Rate', key: 'unit_price', width: 12 },
    { header: 'Amount', key: 'amount', width: 14 },
  ];
  payload.lines.forEach(l => sh.addRow(l));
  sh.addRow({});
  sh.addRow({ description: 'Subtotal', amount: payload.subtotal });
  if (Number(payload.overhead_multiplier) !== 1) {
    sh.addRow({ description: `Overhead (${payload.overhead_multiplier}×)`, amount: payload.overhead });
  }
  if (Number(payload.profit_pct) !== 0) {
    sh.addRow({ description: `Profit (${payload.profit_pct}%)`, amount: payload.profit });
  }
  sh.addRow({ description: 'TOTAL', amount: payload.total }).font = { bold: true };

  const safe = (invoiceNumber || 'invoice').replace(/[^\w.-]+/g, '_');
  const filePath = path.join(outDir, `${safe}.xlsx`);
  await wb.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = { buildInvoicePayload, writeInvoiceXlsx };
