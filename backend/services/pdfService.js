// services/pdfService.js — render a simple HTML invoice → PDF via Puppeteer.
// Falls back to a no-op if puppeteer can't launch (e.g. missing system libs in dev).

const fs = require('fs');
const path = require('path');

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Inline a tenant logo for offline rendering by Puppeteer. Pulls bytes from the
// organizations.logo_data column (BYTEA); legacy /uploads/ paths still work as a
// fallback. Returns a data: URI, or null if no logo is set.
function logoDataUri(org) {
  if (!org) return null;
  if (org.logo_data) {
    const buf = Buffer.isBuffer(org.logo_data) ? org.logo_data : Buffer.from(org.logo_data);
    const mime = org.logo_mime || 'image/png';
    return `data:${mime};base64,${buf.toString('base64')}`;
  }
  const logoUrl = org.logo_url;
  if (logoUrl && typeof logoUrl === 'string' && logoUrl.startsWith('/uploads/')) {
    const abs = path.join(__dirname, '..', logoUrl.replace(/^\/+/, ''));
    try {
      const buf = fs.readFileSync(abs);
      const ext = path.extname(abs).toLowerCase();
      const mime = ext === '.svg' ? 'image/svg+xml'
        : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg'
        : ext === '.webp' ? 'image/webp'
        : ext === '.gif' ? 'image/gif'
        : 'image/png';
      return `data:${mime};base64,${buf.toString('base64')}`;
    } catch { /* ignore */ }
  }
  return null;
}

function renderHtml({ org, project, invoiceNumber, period, payload }) {
  const fmt = n => `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const fmtDate = s => {
    if (!s) return '';
    const str = typeof s === 'string' ? s : (s instanceof Date ? s.toISOString() : String(s));
    const m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
    const d = new Date(str);
    if (Number.isNaN(d.getTime())) return escapeHtml(s);
    return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const addressLines = s => String(s || '').split(/\n|,\s*/).filter(Boolean).map(escapeHtml);
  const logoUri = logoDataUri(org);

  const lines = payload.lines.map(l => `
    <tr>
      <td>${escapeHtml(l.description)}</td>
      <td class="num">${l.hours}</td>
      <td class="num">${fmt(l.unit_price)}</td>
      <td class="num">${fmt(l.amount)}</td>
    </tr>
  `).join('');

  const orgAddrHtml = addressLines(org?.address).map(l => `<div>${l}</div>`).join('');
  const clientAddrHtml = addressLines(payload.client?.address).map(l => `<div>${l}</div>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"/>
  <style>
    @page { size: Letter; margin: 0.5in; }
    * { box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, "Helvetica Neue", Arial, sans-serif; color: #1c2733; margin: 0; font-size: 12px; line-height: 1.45; }
    .doc { padding: 8px 4px 0; }
    .hdr { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 18px; border-bottom: 3px solid #2a7a8a; gap: 18px; }
    .hdr .brand { max-width: 60%; display: flex; gap: 14px; align-items: center; }
    .hdr .brand .logo { width: 64px; height: 64px; object-fit: contain; flex-shrink: 0; }
    .hdr .brand .name { font-size: 22px; font-weight: 700; color: #2a7a8a; margin-bottom: 4px; }
    .hdr .brand .addr { color: #4b5b6c; font-size: 11px; line-height: 1.5; }
    .hdr .meta { text-align: right; }
    .hdr .meta .badge { display: inline-block; font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6a7a8a; }
    .hdr .meta .num { font-size: 22px; font-weight: 700; color: #1c2733; margin-top: 2px; }
    .hdr .meta .meta-row { margin-top: 8px; font-size: 11px; color: #4b5b6c; }
    .hdr .meta .meta-row b { color: #1c2733; font-weight: 600; }

    .parties { display: flex; gap: 28px; margin-top: 22px; }
    .party { flex: 1; background: #f5f7fa; border-radius: 8px; padding: 14px 16px; }
    .party .label { font-size: 10px; letter-spacing: 0.12em; text-transform: uppercase; color: #6a7a8a; margin-bottom: 6px; }
    .party .name { font-size: 13px; font-weight: 600; margin-bottom: 4px; }
    .party .row { font-size: 11px; color: #4b5b6c; }

    .project-bar { margin-top: 22px; padding: 12px 16px; border: 1px solid #e1e6ec; border-radius: 8px; display: flex; justify-content: space-between; gap: 16px; }
    .project-bar .col { font-size: 11px; }
    .project-bar .col .l { color: #6a7a8a; text-transform: uppercase; letter-spacing: 0.1em; font-size: 9px; margin-bottom: 3px; }
    .project-bar .col .v { font-weight: 600; font-size: 12px; color: #1c2733; }

    table.lines { width: 100%; border-collapse: collapse; margin-top: 22px; }
    table.lines th { text-align: left; font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; color: #6a7a8a; padding: 9px 10px; border-bottom: 1.5px solid #2a7a8a; }
    table.lines td { padding: 8px 10px; border-bottom: 1px solid #eef1f4; vertical-align: top; }
    table.lines td.desc { max-width: 360px; }
    .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

    .totals-wrap { display: flex; justify-content: flex-end; margin-top: 14px; }
    .totals { min-width: 280px; }
    .totals .row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 12px; }
    .totals .row .l { color: #4b5b6c; }
    .totals .row.grand { margin-top: 6px; padding-top: 10px; border-top: 2px solid #1c2733; font-size: 14px; font-weight: 700; color: #1c2733; }
    .totals .row.grand .v { color: #2a7a8a; }

    .footer { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e1e6ec; font-size: 10px; color: #6a7a8a; text-align: center; }
    .copyright { margin-top: 6px; font-size: 9px; color: #95a3b3; text-align: center; }
  </style></head><body>
    <div class="doc">
      <div class="hdr">
        <div class="brand">
          ${logoUri ? `<img class="logo" src="${logoUri}" alt="logo"/>` : ''}
          <div>
            <div class="name">${escapeHtml(org?.name || 'OpeRRa')}</div>
            <div class="addr">
              ${orgAddrHtml || ''}
              ${org?.phone ? `<div>${escapeHtml(org.phone)}</div>` : ''}
              ${org?.contact_email ? `<div>${escapeHtml(org.contact_email)}</div>` : ''}
            </div>
          </div>
        </div>
        <div class="meta">
          <div class="badge">Invoice</div>
          <div class="num">${escapeHtml(invoiceNumber)}</div>
          <div class="meta-row"><b>Issued:</b> ${fmtDate(new Date().toISOString().slice(0, 10))}</div>
          <div class="meta-row"><b>Period:</b> ${fmtDate(period.start)} → ${fmtDate(period.end)}</div>
        </div>
      </div>

      <div class="parties">
        <div class="party">
          <div class="label">Bill To</div>
          <div class="name">${escapeHtml(payload.client?.name || '')}</div>
          ${payload.client?.contact ? `<div class="row">${escapeHtml(payload.client.contact)}</div>` : ''}
          ${clientAddrHtml ? `<div class="row">${clientAddrHtml}</div>` : ''}
          ${payload.client?.email ? `<div class="row">${escapeHtml(payload.client.email)}</div>` : ''}
          ${payload.client?.phone ? `<div class="row">${escapeHtml(payload.client.phone)}</div>` : ''}
        </div>
        <div class="party">
          <div class="label">From</div>
          <div class="name">${escapeHtml(org?.name || '')}</div>
          ${orgAddrHtml ? `<div class="row">${orgAddrHtml}</div>` : ''}
          ${org?.contact_email ? `<div class="row">${escapeHtml(org.contact_email)}</div>` : ''}
          ${org?.phone ? `<div class="row">${escapeHtml(org.phone)}</div>` : ''}
        </div>
      </div>

      <div class="project-bar">
        <div class="col"><div class="l">Project Code</div><div class="v">${escapeHtml(project.code || '—')}</div></div>
        <div class="col"><div class="l">Project</div><div class="v">${escapeHtml(project.name || '')}</div></div>
        ${project.location ? `<div class="col"><div class="l">Location</div><div class="v">${escapeHtml(project.location)}</div></div>` : ''}
      </div>

      <table class="lines">
        <thead><tr><th>Description</th><th class="num">Hours</th><th class="num">Rate</th><th class="num">Amount</th></tr></thead>
        <tbody>${lines}</tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals">
          <div class="row"><span class="l">Subtotal</span><span class="v num">${fmt(payload.subtotal)}</span></div>
          <div class="row"><span class="l">Overhead (${payload.overhead_multiplier}×)</span><span class="v num">${fmt(payload.overhead)}</span></div>
          <div class="row"><span class="l">Profit (${payload.profit_pct}%)</span><span class="v num">${fmt(payload.profit)}</span></div>
          <div class="row grand"><span class="l">Total Due</span><span class="v num">${fmt(payload.total)}</span></div>
        </div>
      </div>

      <div class="footer">Thank you for your business · Generated by OpeRRa</div>
      <div class="copyright">© ${new Date().getFullYear()} Integr8Works</div>
    </div>
  </body></html>`;
}

async function renderInvoicePdfBuffer(args) {
  const html = renderHtml(args);
  let puppeteer;
  try { puppeteer = require('puppeteer'); } catch { /* not installed */ }
  if (!puppeteer) throw new Error('Puppeteer not available — cannot render PDF in this environment.');

  const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const buf = await page.pdf({
      format: 'Letter', printBackground: true,
      margin: { top: '24px', bottom: '24px', left: '24px', right: '24px' },
    });
    return buf;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function renderInvoicePdf(args, outPath) {
  try {
    const buf = await renderInvoicePdfBuffer(args);
    fs.writeFileSync(outPath, buf);
    return outPath;
  } catch (err) {
    console.warn('[pdf] puppeteer failed, writing HTML preview instead:', err.message);
    fs.writeFileSync(outPath.replace(/\.pdf$/, '.html'), renderHtml(args));
    return null;
  }
}

module.exports = { renderInvoicePdf, renderInvoicePdfBuffer };
