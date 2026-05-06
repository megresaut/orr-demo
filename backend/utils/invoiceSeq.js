// utils/invoiceSeq.js — bump invoice numbers like "INVOICE_01" → "INVOICE_02".
function bumpNumbers(seq) {
  if (!seq) return 'INVOICE_01';
  const m = String(seq).match(/^(.*?)(\d+)$/);
  if (!m) return `${seq}_01`;
  const [, prefix, num] = m;
  const next = String(Number(num) + 1).padStart(num.length, '0');
  return `${prefix}${next}`;
}
module.exports = { bumpNumbers };
