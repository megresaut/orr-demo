// services/excelTimesheetService.js
// Parses the Employee Project Time template (slide 26).
// Rows: Date, StartTime, EndTime, ResourceName, ResourceTaskDescription, ...
// ResourceTaskDescription format: "<projectCode>-<taskCode>-<hrs>hr-<note>"

const ExcelJS = require('exceljs');

function cellText(cell) {
  if (!cell) return '';
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object' && 'text' in v) return String(v.text);
  if (typeof v === 'object' && 'result' in v) return String(v.result);
  return String(v);
}

function parseDate(cell) {
  const v = cell?.value;
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const t = cellText(cell).trim();
  const m = t.match(/^(\d{1,4})[.\/-](\d{1,2})[.\/-](\d{1,4})$/);
  if (!m) return null;
  let [, a, b, c] = m;
  if (a.length === 4) return `${a}-${b.padStart(2, '0')}-${c.padStart(2, '0')}`;
  return `${c}-${a.padStart(2, '0')}-${b.padStart(2, '0')}`;
}

function parseHours(start, end) {
  // "10.55AM"/"10.00am" → minutes
  const toMin = s => {
    if (!s) return null;
    const m = String(s).trim().match(/^(\d{1,2})[.:](\d{2})\s*(am|pm)?$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const min = Number(m[2]);
    const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return h * 60 + min;
  };
  const a = toMin(start), b = toMin(end);
  if (a == null || b == null) return null;
  let diff = (b - a) / 60;
  if (diff < 0) diff += 24;
  return Math.round(diff * 100) / 100;
}

function extractTaskCode(desc) {
  if (!desc) return null;
  // Pattern: <projectCode>-<taskCode>-<hrs>hr-<...>
  // taskCode is dotted, e.g. 1.01.02
  const m = String(desc).match(/-(\d+(?:\.\d+){1,3})-/);
  return m ? m[1] : null;
}

function extractEmbeddedHours(desc) {
  if (!desc) return null;
  const m = String(desc).match(/-(\d+(?:\.\d+)?)hrs?-/i);
  return m ? Number(m[1]) : null;
}

async function parseTimesheet(filePath, sheetNameHint = null) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(filePath);
  const sheet = (sheetNameHint && wb.getWorksheet(sheetNameHint))
    || wb.worksheets.find(s => /time|employee/i.test(s.name))
    || wb.worksheets[0];

  // Find the header row containing "Date" + "ResourceName"
  let headerRow = -1;
  for (let r = 1; r <= Math.min(sheet.rowCount, 30); r++) {
    const row = sheet.getRow(r);
    const cells = [];
    for (let c = 1; c <= 10; c++) cells.push(cellText(row.getCell(c)).toLowerCase());
    if (cells.includes('date') && cells.some(x => /resourcename|resource name/.test(x))) {
      headerRow = r; break;
    }
  }
  if (headerRow < 0) return [];

  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, '').trim();
  const cols = {};
  const hr = sheet.getRow(headerRow);
  for (let c = 1; c <= 10; c++) {
    const k = norm(cellText(hr.getCell(c)));
    if (k === 'date') cols.date = c;
    else if (k === 'starttime') cols.start = c;
    else if (k === 'endtime') cols.end = c;
    else if (k === 'resourcename') cols.resource = c;
    else if (k === 'resourcetaskdescription') cols.desc = c;
  }

  const entries = [];
  for (let r = headerRow + 1; r < headerRow + 500; r++) {
    const dr = sheet.getRow(r);
    const date = cols.date ? parseDate(dr.getCell(cols.date)) : null;
    if (!date) continue;
    const resource = cols.resource ? cellText(dr.getCell(cols.resource)) : '';
    if (!resource) continue;
    const desc = cols.desc ? cellText(dr.getCell(cols.desc)) : '';
    const start = cols.start ? cellText(dr.getCell(cols.start)) : null;
    const end = cols.end ? cellText(dr.getCell(cols.end)) : null;
    const computed = parseHours(start, end);
    const embedded = extractEmbeddedHours(desc);
    entries.push({
      entry_date: date,
      start_time: start,
      end_time: end,
      hours: computed != null ? computed : (embedded || 0),
      resource_name: resource,
      description: desc,
      task_code: extractTaskCode(desc),
    });
  }
  return entries;
}

module.exports = { parseTimesheet, extractTaskCode };
