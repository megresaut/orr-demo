// Date helpers that avoid the classic UTC-shift bug. Backend stores date-only
// values as YYYY-MM-DD; `new Date('2026-05-01')` parses as UTC midnight, and
// `toLocaleDateString` then renders the previous day for any negative-UTC tz.
// These helpers parse the parts directly so the displayed day matches what
// was typed.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parseLocalDate(s) {
  if (!s) return null;
  // Accept Date instances, ISO strings, and YYYY-MM-DD or YYYY-MM-DDTHH:MM... slices.
  const str = typeof s === 'string' ? s : (s instanceof Date ? s.toISOString() : String(s));
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(s) {
  const d = parseLocalDate(s);
  if (!d) return s ? String(s) : '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

export function formatDateTime(s) {
  if (!s) return '';
  const d = s instanceof Date ? s : new Date(s);
  if (Number.isNaN(d.getTime())) return String(s);
  return d.toLocaleString();
}
