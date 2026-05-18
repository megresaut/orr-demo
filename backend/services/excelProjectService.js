// services/excelProjectService.js
// Parses the OpeRRa360 Project Onboarding template (slide 24) and the
// Project Task template (slide 25). Tolerant to header label drift.

const ExcelJS = require('exceljs');

function findRow(sheet, predicate, maxRows = 60) {
  for (let r = 1; r <= Math.min(sheet.rowCount, maxRows); r++) {
    const row = sheet.getRow(r);
    if (predicate(row)) return r;
  }
  return -1;
}

function cellText(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return String(v.result);
  return String(v);
}

function cellNumber(cell) {
  const t = cellText(cell).replace(/[$,]/g, '').trim();
  if (!t) return 0;
  const n = Number(t);
  return Number.isFinite(n) ? n : 0;
}

function cellDate(cell) {
  const v = cell?.value;
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = cellText(cell);
  // Accept 04.16.2026, 4/16/2026, 2026-04-16
  const m = t.match(/^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})$/);
  if (!m) return null;
  let [, a, b, c] = m;
  if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
}

/**
 * Parse the project-onboarding sheet.
 * Looks for "Project Information" / "Client Information" / "Project Timeline" /
 * "Resources and Labor" section headers and extracts the row beneath each.
 */
async function parseProjectOnboarding(filePath) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = wb.worksheets.find(s => /onboard|project/i.test(s.name)) || wb.worksheets[0];

  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // Find anchor rows
  const projInfoRow = findRow(sheet, r => /project information/i.test(cellText(r.getCell(1))));
  const clientInfoRow = findRow(sheet, r => /client information/i.test(cellText(r.getCell(1))));
  const timelineRow = findRow(sheet, r => /project timeline/i.test(cellText(r.getCell(1))));
  const proposalRow = findRow(sheet, r => /proposal information/i.test(cellText(r.getCell(1))));
  const resourceRow = findRow(sheet, r => /resources and labor|resources & labor/i.test(cellText(r.getCell(1))));

  // Project info row: header row is +1 from anchor, data row is +2
  const project = {};
  if (projInfoRow > 0) {
    const headerRow = sheet.getRow(projInfoRow + 1);
    // First non-template data row (skip "Eg." example rows)
    for (let r = projInfoRow + 2; r <= projInfoRow + 6; r++) {
      const dr = sheet.getRow(r);
      const firstCell = cellText(dr.getCell(1));
      if (firstCell && !/^eg\.?\s/i.test(firstCell)) {
        for (let c = 1; c <= 8; c++) {
          const key = norm(cellText(headerRow.getCell(c)));
          const val = cellText(dr.getCell(c));
          if (!key) continue;
          if (/project name/.test(key)) project.name = val;
          else if (/project code/.test(key)) project.code = val;
          else if (/project location/.test(key)) project.location = val;
          else if (/project description/.test(key)) project.description = val;
        }
        break;
      }
    }
  }

  // Client info row
  const client = {};
  if (clientInfoRow > 0) {
    const headerRow = sheet.getRow(clientInfoRow + 1);
    for (let r = clientInfoRow + 2; r <= clientInfoRow + 6; r++) {
      const dr = sheet.getRow(r);
      const first = cellText(dr.getCell(1));
      if (first && !/^eg\.?\s/i.test(first)) {
        for (let c = 1; c <= 8; c++) {
          const key = norm(cellText(headerRow.getCell(c)));
          const val = cellText(dr.getCell(c));
          if (!key) continue;
          if (/client information|client name/.test(key)) client.name = val;
          else if (/contact person/.test(key)) client.contact = val;
          else if (/contact details|email/.test(key)) {
            const m = val.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
            if (m) client.email = m[0];
            const p = val.match(/[\d\s+().-]{7,}/);
            if (p) client.phone = p[0].trim();
          } else if (/^address$/.test(key)) client.address = val;
        }
        break;
      }
    }
  }

  // Timeline / overhead / profit
  const timeline = { overhead_multiplier: 1.66, profit_pct: 10 };
  if (timelineRow > 0) {
    const headerRow = sheet.getRow(timelineRow + 1);
    for (let r = timelineRow + 2; r <= timelineRow + 6; r++) {
      const dr = sheet.getRow(r);
      const first = cellText(dr.getCell(1));
      if (first && !/^eg\.?\s/i.test(first)) {
        for (let c = 1; c <= 6; c++) {
          const key = norm(cellText(headerRow.getCell(c)));
          if (/start date/.test(key)) timeline.start_date = cellDate(dr.getCell(c));
          else if (/end date/.test(key)) timeline.end_date = cellDate(dr.getCell(c));
          else if (/overhead/.test(key)) timeline.overhead_multiplier = cellNumber(dr.getCell(c)) || 1.66;
          else if (/profit/.test(key)) timeline.profit_pct = cellNumber(dr.getCell(c)) || 10;
        }
        break;
      }
    }
  }

  // Proposal / contract amounts
  const proposal = {};
  if (proposalRow > 0) {
    const headerRow = sheet.getRow(proposalRow + 1);
    for (let r = proposalRow + 2; r <= proposalRow + 6; r++) {
      const dr = sheet.getRow(r);
      const first = cellText(dr.getCell(1));
      if (first && !/^eg\.?\s/i.test(first)) {
        for (let c = 1; c <= 8; c++) {
          const key = norm(cellText(headerRow.getCell(c)));
          if (/total contract amount/.test(key)) proposal.contract_amount = cellNumber(dr.getCell(c));
          else if (/contingency|allowance/.test(key)) proposal.allowance = cellNumber(dr.getCell(c));
        }
        break;
      }
    }
  }

  // Labor rates
  const rates = [];
  if (resourceRow > 0) {
    const headerRow = sheet.getRow(resourceRow + 1);
    let roleCol = 0, nameCol = 0, rateCol = 0;
    for (let c = 1; c <= 10; c++) {
      const k = norm(cellText(headerRow.getCell(c)));
      if (/resource role/.test(k)) roleCol = c;
      else if (/resource name/.test(k)) nameCol = c;
      else if (/^rate$/.test(k)) rateCol = c;
    }
    if (roleCol && rateCol) {
      for (let r = resourceRow + 2; r < resourceRow + 50; r++) {
        const dr = sheet.getRow(r);
        const role = cellText(dr.getCell(roleCol));
        if (!role || /^eg\.?/i.test(role)) continue;
        const rate = cellNumber(dr.getCell(rateCol));
        const name = nameCol ? cellText(dr.getCell(nameCol)) : null;
        if (role) rates.push({ role, name, rate });
      }
    }
  }

  return { project, client, timeline, proposal, rates };
}

/**
 * Parse the Project Task template (slide 25) — rows of tasks with budget/billing.
 */
async function parseProjectTasks(filePath, sheetNameHint = null) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = (sheetNameHint && wb.getWorksheet(sheetNameHint))
    || wb.worksheets.find(s => /task/i.test(s.name))
    || wb.worksheets[0];

  // Header row contains "Task Name" / "Section/Column" / "Budget Hrs" etc.
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const headerRow = findRow(sheet, r => {
    for (let c = 1; c <= 12; c++) if (/task name/i.test(cellText(r.getCell(c)))) return true;
    return false;
  });
  if (headerRow < 0) return [];

  const cols = {};
  const hr = sheet.getRow(headerRow);
  for (let c = 1; c <= 14; c++) {
    const k = norm(cellText(hr.getCell(c)));
    if (!k) continue;
    if (/^task name$/.test(k)) cols.task_name = c;
    else if (/section\/column|^code$|task code/.test(k)) cols.task_code = c;
    else if (/^assignee$/.test(k)) cols.assignee_name = c;
    else if (/assignee email/.test(k)) cols.assignee_email = c;
    else if (/start date/.test(k)) cols.start_date = c;
    else if (/due date/.test(k)) cols.due_date = c;
    else if (/budget hrs|budget hours/.test(k)) cols.budget_hours = c;
    else if (/billed hrs|billed hours/.test(k)) cols.billed_hours = c;
    else if (/billing rate/.test(k)) cols.billing_rate = c;
  }

  const tasks = [];
  for (let r = headerRow + 1; r < headerRow + 200; r++) {
    const dr = sheet.getRow(r);
    const name = cols.task_name ? cellText(dr.getCell(cols.task_name)) : '';
    if (!name) {
      const codeCell = cols.task_code ? cellText(dr.getCell(cols.task_code)) : '';
      if (!codeCell) continue;
    }
    const code = cols.task_code ? cellText(dr.getCell(cols.task_code)) : null;
    if (!code && !name) continue;
    tasks.push({
      task_code: code || null,
      task_name: name || code,
      assignee_name: cols.assignee_name ? cellText(dr.getCell(cols.assignee_name)) : null,
      assignee_email: cols.assignee_email ? cellText(dr.getCell(cols.assignee_email)) : null,
      start_date: cols.start_date ? cellDate(dr.getCell(cols.start_date)) : null,
      due_date: cols.due_date ? cellDate(dr.getCell(cols.due_date)) : null,
      budget_hours: cols.budget_hours ? cellNumber(dr.getCell(cols.budget_hours)) : 0,
      billed_hours: cols.billed_hours ? cellNumber(dr.getCell(cols.billed_hours)) : 0,
      billing_rate: cols.billing_rate ? cellNumber(dr.getCell(cols.billing_rate)) : 0,
    });
  }
  return tasks;
}

/**
 * Parse a resources/labor-rates sheet — either a stand-alone workbook with
 * columns "Resource Role" / "Resource Name" / "Rate", or the "Resources and Labor"
 * block from the onboarding template.
 */
async function parseProjectRates(filePath, sheetNameHint = null) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = (sheetNameHint && wb.getWorksheet(sheetNameHint))
    || wb.worksheets.find(s => /resource|labor|rate/i.test(s.name))
    || wb.worksheets[0];

  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

  // First, try locating a "Resources and Labor" anchor (onboarding-style block).
  let anchor = findRow(sheet, r => /resources and labor|resources & labor/i.test(cellText(r.getCell(1))));
  let headerRow = -1;
  if (anchor > 0) headerRow = anchor + 1;

  // Otherwise look for a header row that contains "Resource Role" or "Role".
  if (headerRow < 0) {
    headerRow = findRow(sheet, r => {
      for (let c = 1; c <= 12; c++) {
        const k = norm(cellText(r.getCell(c)));
        if (/resource role|^role$/.test(k)) return true;
      }
      return false;
    });
  }
  if (headerRow < 0) return [];

  const hr = sheet.getRow(headerRow);
  let roleCol = 0, nameCol = 0, rateCol = 0;
  for (let c = 1; c <= 12; c++) {
    const k = norm(cellText(hr.getCell(c)));
    if (/resource role|^role$/.test(k)) roleCol = c;
    else if (/resource name|^name$/.test(k)) nameCol = c;
    else if (/^rate$|billing rate|hourly rate/.test(k)) rateCol = c;
  }
  if (!roleCol || !rateCol) return [];

  const rates = [];
  for (let r = headerRow + 1; r < headerRow + 200; r++) {
    const dr = sheet.getRow(r);
    const role = cellText(dr.getCell(roleCol));
    if (!role || /^eg\.?/i.test(role)) continue;
    const rate = cellNumber(dr.getCell(rateCol));
    const name = nameCol ? cellText(dr.getCell(nameCol)) : null;
    rates.push({ role, name, rate });
  }
  return rates;
}

module.exports = { parseProjectOnboarding, parseProjectTasks, parseProjectRates };
