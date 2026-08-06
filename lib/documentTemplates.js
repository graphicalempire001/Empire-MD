// lib/documentTemplates.js
// One HTML+CSS template powers BOTH the WhatsApp PDF export (via puppeteer,
// see lib/htmlToPdf.js) and the web preview at /documents.html. Keeping them
// on the same template means the PDF a customer receives always matches what
// you saw on screen — no drift between "what I designed" and "what got sent."

function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function naira(n) {
    return '₦' + (Number(n) || 0).toLocaleString('en-NG');
}

/**
 * data = {
 *   kind: 'INVOICE' | 'RECEIPT',
 *   header: { title, subtitle, phone, email, address },
 *   rows: [{ item, qty, price, sub }],       // invoice line items
 *   total: number,
 *   receiptMeta: { amount, desc, payer },     // receipt-only
 *   bankDetails: { bankName, accountNumber, accountName, note }
 * }
 */
function renderDocumentHtml(data) {
    const {
        kind = 'INVOICE',
        header = {},
        rows = [],
        total = 0,
        receiptMeta = null,
        bankDetails = null
    } = data;

    const h = {
        title: header.title || 'Empire MD',
        subtitle: header.subtitle || '',
        phone: header.phone || '',
        email: header.email || '',
        address: header.address || ''
    };

    const isReceipt = kind === 'RECEIPT';
    const docNumber = 'DOC-' + Date.now().toString().slice(-8);
    const dateStr = new Date().toLocaleString('en-NG', {
        year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    const tableRows = rows.map((r, i) => `
      <tr class="${i % 2 === 1 ? 'alt' : ''}">
        <td class="num">${i + 1}</td>
        <td>${esc(r.item)}</td>
        <td class="num">${esc(r.qty)}</td>
        <td class="num">${naira(r.price)}</td>
        <td class="num strong">${naira(r.sub)}</td>
      </tr>`).join('');

    const bankBlock = bankDetails && (bankDetails.accountNumber || bankDetails.bankName) ? `
      <div class="bank-card">
        <div class="bank-card-title">Payment Details</div>
        <div class="bank-row"><span>Bank</span><strong>${esc(bankDetails.bankName || '—')}</strong></div>
        <div class="bank-row"><span>Account</span><strong>${esc(bankDetails.accountNumber || '—')}</strong></div>
        <div class="bank-row"><span>Name</span><strong>${esc(bankDetails.accountName || '—')}</strong></div>
        ${bankDetails.note ? `<div class="bank-note">${esc(bankDetails.note)}</div>` : ''}
      </div>` : '';

    const bodyBlock = isReceipt && receiptMeta ? `
      <div class="receipt-block">
        <div class="receipt-row">
          <span class="label">Description</span>
          <span class="value">${esc(receiptMeta.desc || 'Payment')}</span>
        </div>
        ${receiptMeta.payer ? `
        <div class="receipt-row">
          <span class="label">Received From</span>
          <span class="value">${esc(receiptMeta.payer)}</span>
        </div>` : ''}
        <div class="amount-box">
          <span>Amount Paid</span>
          <strong>${naira(receiptMeta.amount)}</strong>
        </div>
        <div class="status-pill">✓ PAID / RECORDED</div>
      </div>` : `
      <table class="items">
        <thead>
          <tr>
            <th class="num">#</th>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>${tableRows || `<tr><td colspan="5" class="empty">No line items yet</td></tr>`}</tbody>
      </table>
      <div class="total-row">
        <div class="total-box">
          <span>Total</span>
          <strong>${naira(total)}</strong>
        </div>
      </div>`;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    color: #0f172a;
    background: #ffffff;
    font-size: 13px;
    line-height: 1.5;
  }
  .sheet { max-width: 780px; margin: 0 auto; padding: 0 0 40px; }

  /* Brand bar — matches Empire Digitals identity: black + neon-lime */
  .brand-bar { height: 10px; background: linear-gradient(90deg, #0a0a0a 0%, #0a0a0a 60%, #C6FF3D 100%); }

  .doc-header {
    display: flex; justify-content: space-between; align-items: flex-start;
    padding: 28px 40px 20px;
    border-bottom: 3px solid #0a0a0a;
  }
  .company h1 { font-size: 22px; font-weight: 800; color: #0a0a0a; letter-spacing: -0.5px; }
  .company .subtitle { color: #64748b; font-size: 12px; margin-top: 2px; }
  .company .contact { color: #64748b; font-size: 11px; margin-top: 8px; }
  .doc-type { text-align: right; }
  .doc-type .badge {
    display: inline-block;
    background: #C6FF3D;
    color: #0a0a0a;
    font-weight: 800;
    font-size: 14px;
    letter-spacing: 1px;
    padding: 6px 16px;
    border-radius: 999px;
  }
  .doc-type .meta { color: #64748b; font-size: 11px; margin-top: 8px; }
  .doc-type .meta strong { color: #0a0a0a; }

  .content { padding: 24px 40px 0; }

  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items thead th {
    background: #0a0a0a;
    color: #C6FF3D;
    text-align: left;
    font-size: 10px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    padding: 10px 12px;
  }
  table.items thead th.num { text-align: right; }
  table.items tbody td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; }
  table.items tbody tr.alt { background: #f8fafc; }
  table.items td.num { text-align: right; font-variant-numeric: tabular-nums; }
  table.items td.strong { font-weight: 700; color: #0a0a0a; }
  table.items td.empty { text-align: center; color: #94a3b8; padding: 24px; }

  .total-row { display: flex; justify-content: flex-end; margin-top: 16px; }
  .total-box {
    background: #0a0a0a; color: #ffffff;
    border-radius: 8px;
    padding: 14px 24px;
    display: flex; align-items: center; gap: 16px;
  }
  .total-box span { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #C6FF3D; }
  .total-box strong { font-size: 20px; font-weight: 800; }

  .receipt-block { margin-top: 12px; }
  .receipt-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #e2e8f0; }
  .receipt-row .label { color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  .receipt-row .value { font-weight: 600; }
  .amount-box {
    background: #0a0a0a; color: #ffffff; border-radius: 8px;
    margin-top: 20px; padding: 20px 24px;
    display: flex; justify-content: space-between; align-items: center;
  }
  .amount-box span { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #C6FF3D; }
  .amount-box strong { font-size: 28px; font-weight: 800; }
  .status-pill {
    display: inline-block; margin-top: 16px;
    background: #ecfdf5; color: #15803d; font-weight: 700; font-size: 11px;
    padding: 6px 14px; border-radius: 999px; letter-spacing: 0.5px;
  }

  .bank-card {
    margin: 28px 40px 0; padding: 16px 20px;
    border: 1.5px solid #e2e8f0; border-radius: 10px;
    border-left: 4px solid #C6FF3D;
    background: #fafafa;
  }
  .bank-card-title { font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #0a0a0a; margin-bottom: 8px; }
  .bank-row { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
  .bank-row span { color: #64748b; }
  .bank-note { margin-top: 8px; font-size: 11px; color: #64748b; font-style: italic; }

  .footer {
    text-align: center; color: #94a3b8; font-size: 10px;
    margin: 36px 40px 0; padding-top: 16px; border-top: 1px solid #e2e8f0;
  }
</style>
</head>
<body>
  <div class="sheet">
    <div class="brand-bar"></div>
    <div class="doc-header">
      <div class="company">
        <h1>${esc(h.title)}</h1>
        ${h.subtitle ? `<div class="subtitle">${esc(h.subtitle)}</div>` : ''}
        ${(h.phone || h.email) ? `<div class="contact">${esc([h.phone, h.email].filter(Boolean).join('  ·  '))}</div>` : ''}
        ${h.address ? `<div class="contact">${esc(h.address)}</div>` : ''}
      </div>
      <div class="doc-type">
        <div class="badge">${esc(kind)}</div>
        <div class="meta">
          <strong>${esc(docNumber)}</strong><br>
          ${esc(dateStr)}
        </div>
      </div>
    </div>
    <div class="content">
      ${bodyBlock}
    </div>
    ${bankBlock}
    <div class="footer">Generated by ${esc(h.title)} · Thank you for your business</div>
  </div>
</body>
</html>`;
}

module.exports = { renderDocumentHtml, naira };
