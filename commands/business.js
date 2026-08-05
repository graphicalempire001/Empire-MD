/**
 * Empire MD — Business tools (styled PDF invoices, OCR, Word, bank, away)
 * npm i pdfkit docx form-data
 * OCR_API_KEY in .env (optional; demo key works with limits)
 */
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { updateSettings } = require('../lib/database');

async function persist(sock, settings, patch) {
  const merged = { ...(settings || {}), ...patch };
  sock.botSettings = merged;
  if (sock.sessionId) {
    try { await updateSettings(sock.sessionId, patch); }
    catch (e) { console.error('business persist:', e.message); }
  }
  return merged;
}

function bankCard(s) {
  const b = s?.bankDetails || {};
  if (!b.accountNumber && !b.bankName) return null;
  return (
    `🏦 *Payment details*\n` +
    `*Bank:* ${b.bankName || '—'}\n` +
    `*Account:* ${b.accountNumber || '—'}\n` +
    `*Name:* ${b.accountName || '—'}` +
    (b.note ? `\n*Note:* ${b.note}` : '')
  );
}

function naira(n) {
  return '₦' + (Number(n) || 0).toLocaleString('en-NG');
}

function parseLineItems(text) {
  const lines = String(text || '').split(';').map((l) => l.trim()).filter(Boolean);
  const rows = [];
  let total = 0;
  for (const line of lines) {
    const p = line.split('|').map((x) => x.trim());
    if (p.length < 3) continue;
    const item = p[0];
    const qty = Number(p[1]) || 1;
    const price = Number(String(p[2]).replace(/,/g, '')) || 0;
    const sub = qty * price;
    total += sub;
    rows.push({ item, qty, price, sub });
  }
  return { rows, total };
}

function getHeader(s) {
  const h = s?.docHeader || {};
  return {
    title: h.title || s?.botName || 'Empire MD',
    subtitle: h.subtitle || '',
    phone: h.phone || '',
    email: h.email || '',
    address: h.address || ''
  };
}

/** WhatsApp-friendly text invoice */
function invoiceText(botName, rows, total, s, kind = 'INVOICE') {
  const h = getHeader(s);
  let body = `🧾 *${kind}*\n`;
  body += `*${h.title}*\n`;
  if (h.subtitle) body += `${h.subtitle}\n`;
  if (h.phone || h.email) body += [h.phone, h.email].filter(Boolean).join(' · ') + '\n';
  body += `📅 ${new Date().toLocaleString()}\n`;
  body += `━━━━━━━━━━━━━━━━━━━━\n`;
  rows.forEach((r, i) => {
    body += `${i + 1}. *${r.item}*\n   ${r.qty} × ${naira(r.price)} = *${naira(r.sub)}*\n`;
  });
  body += `━━━━━━━━━━━━━━━━━━━━\n*Total: ${naira(total)}*\n`;
  const card = bankCard(s);
  if (card) body += `\n${card}`;
  return body;
}

/**
 * Styled PDF (CSS-like layout via pdfkit):
 * brand bar, header block, table grid, total box, bank footer
 */
async function makeStyledInvoicePdf({ kind, rows, total, settings, receiptMeta }) {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (_) {
    return null;
  }

  const h = getHeader(settings);
  const brand = '#0f766e'; // teal
  const muted = '#64748b';
  const line = '#e2e8f0';

  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 48 });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageW = doc.page.width;
      const left = 48;
      const right = pageW - 48;
      const contentW = right - left;

      // Top brand bar
      doc.rect(0, 0, pageW, 8).fill(brand);

      // Header company block
      doc.fillColor('#0f172a').fontSize(20).font('Helvetica-Bold')
        .text(h.title, left, 28, { width: contentW * 0.62 });
      doc.font('Helvetica').fontSize(9).fillColor(muted);
      let y = 52;
      if (h.subtitle) { doc.text(h.subtitle, left, y, { width: contentW * 0.62 }); y += 12; }
      if (h.address) { doc.text(h.address, left, y, { width: contentW * 0.62 }); y += 12; }
      if (h.phone || h.email) {
        doc.text([h.phone, h.email].filter(Boolean).join('  ·  '), left, y, { width: contentW * 0.62 });
        y += 12;
      }

      // Document type badge (right)
      doc.font('Helvetica-Bold').fontSize(16).fillColor(brand)
        .text(kind, left, 28, { width: contentW, align: 'right' });
      doc.font('Helvetica').fontSize(9).fillColor(muted)
        .text(new Date().toLocaleString(), left, 50, { width: contentW, align: 'right' });
      if (receiptMeta?.payer) {
        doc.text('From: ' + receiptMeta.payer, left, 64, { width: contentW, align: 'right' });
      }

      // Divider
      y = Math.max(y, 88) + 8;
      doc.moveTo(left, y).lineTo(right, y).strokeColor(line).lineWidth(1).stroke();
      y += 16;

      if (kind === 'RECEIPT' && receiptMeta) {
        doc.fillColor('#0f172a').fontSize(11)
          .text('Description: ' + (receiptMeta.desc || 'Payment'), left, y);
        y += 18;
        doc.font('Helvetica-Bold').fontSize(14).fillColor(brand)
          .text('Amount paid: ' + naira(receiptMeta.amount), left, y);
        y += 28;
        doc.font('Helvetica').fontSize(10).fillColor('#15803d')
          .text('Status: PAID / RECORDED', left, y);
        y += 24;
      } else {
        // Table header
        doc.rect(left, y, contentW, 22).fill('#f1f5f9');
        doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9);
        const colItem = left + 8;
        const colQty = left + contentW * 0.52;
        const colPrice = left + contentW * 0.68;
        const colSub = left + contentW * 0.84;
        doc.text('#', colItem, y + 6, { width: 20 });
        doc.text('ITEM', colItem + 18, y + 6, { width: contentW * 0.4 });
        doc.text('QTY', colQty, y + 6, { width: 40 });
        doc.text('PRICE', colPrice, y + 6, { width: 70 });
        doc.text('AMOUNT', colSub, y + 6, { width: 70, align: 'right' });
        y += 26;

        doc.font('Helvetica').fontSize(9).fillColor('#0f172a');
        rows.forEach((r, i) => {
          if (y > 700) {
            doc.addPage();
            y = 48;
          }
          if (i % 2 === 1) {
            doc.rect(left, y - 2, contentW, 18).fill('#f8fafc');
            doc.fillColor('#0f172a');
          }
          doc.text(String(i + 1), colItem, y, { width: 20 });
          doc.text(r.item, colItem + 18, y, { width: contentW * 0.38 });
          doc.text(String(r.qty), colQty, y, { width: 40 });
          doc.text(naira(r.price), colPrice, y, { width: 70 });
          doc.text(naira(r.sub), colSub, y, { width: right - colSub - 4, align: 'right' });
          y += 18;
        });

        y += 10;
        doc.moveTo(left, y).lineTo(right, y).strokeColor(line).stroke();
        y += 12;
        // Total box
        doc.roundedRect(right - 180, y, 180, 36, 4).fill('#ecfdf5');
        doc.fillColor(brand).font('Helvetica-Bold').fontSize(12)
          .text('TOTAL  ' + naira(total), right - 172, y + 12, { width: 164, align: 'right' });
        y += 50;
      }

      // Bank footer
      const b = settings?.bankDetails;
      if (b && (b.accountNumber || b.bankName)) {
        doc.roundedRect(left, y, contentW, 70, 6).lineWidth(1).strokeColor(line).stroke();
        doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(10)
          .text('Payment details', left + 12, y + 10);
        doc.font('Helvetica').fontSize(9).fillColor('#334155')
          .text(
            `Bank: ${b.bankName || '—'}\nAccount: ${b.accountNumber || '—'}\nName: ${b.accountName || '—'}`,
            left + 12,
            y + 26,
            { width: contentW - 24 }
          );
        y += 80;
      }

      doc.fontSize(8).fillColor(muted)
        .text('Generated by Empire MD · Thank you for your business', left, 780, {
          width: contentW,
          align: 'center'
        });

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function makePlainPdf(title, bodyText, settings) {
  let PDFDocument;
  try { PDFDocument = require('pdfkit'); } catch (_) { return null; }
  const h = getHeader(settings || {});
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.rect(0, 0, doc.page.width, 8).fill('#0f766e');
      doc.fillColor('#0f172a').fontSize(16).font('Helvetica-Bold').text(h.title || title, 50, 30);
      if (h.subtitle) doc.font('Helvetica').fontSize(9).fillColor('#64748b').text(h.subtitle);
      doc.moveDown();
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#0f766e').text(title);
      doc.moveDown(0.5);
      doc.font('Helvetica').fontSize(11).fillColor('#0f172a').text(bodyText || '', { align: 'left', lineGap: 2 });
      doc.end();
    } catch (e) { reject(e); }
  });
}

async function makeDocxBuffer(title, bodyText, settings) {
  let Document, Packer, Paragraph, TextRun;
  try {
    ({ Document, Packer, Paragraph, TextRun } = require('docx'));
  } catch (_) { return null; }
  const h = getHeader(settings || {});
  const children = [
    new Paragraph({ children: [new TextRun({ text: h.title || 'Empire MD', bold: true, size: 32 })] }),
  ];
  if (h.subtitle) children.push(new Paragraph({ children: [new TextRun({ text: h.subtitle, size: 20, color: '64748B' })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: ' ' })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: title, bold: true, size: 26 })] }));
  children.push(new Paragraph({ children: [new TextRun({ text: ' ' })] }));
  String(bodyText || '').split(/\n/).forEach((line) => {
    children.push(new Paragraph({ children: [new TextRun({ text: line || ' ', size: 22 })] }));
  });
  const doc = new Document({ sections: [{ properties: {}, children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function downloadQuotedImage(mek) {
  const q = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return null;
  const node =
    q.imageMessage ||
    q.viewOnceMessage?.message?.imageMessage ||
    q.viewOnceMessageV2?.message?.imageMessage ||
    (q.documentMessage?.mimetype?.startsWith('image/') ? q.documentMessage : null);
  if (!node) return null;
  const kind = q.imageMessage || q.viewOnceMessage || q.viewOnceMessageV2 ? 'image' : 'document';
  const stream = await downloadContentFromMessage(node, kind === 'document' ? 'document' : 'image');
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

/** Advanced OCR: engine 2 + optional second pass, strip noise */
async function runOcrAdvanced(imageBuffer) {
  const apiKey = process.env.OCR_API_KEY || 'helloworld';

  async function once(engine) {
    const b64 = imageBuffer.toString('base64');
    const res = await axios.post(
      'https://api.ocr.space/parse/image',
      {
        language: 'eng',
        isOverlayRequired: false,
        base64Image: 'data:image/jpeg;base64,' + b64,
        OCREngine: engine,
        scale: true,
        detectOrientation: true,
        isTable: true
      },
      { headers: { apikey: apiKey, 'Content-Type': 'application/json' }, timeout: 90000 }
    );
    if (res.data?.IsErroredOnProcessing) {
      const msg = res.data?.ErrorMessage;
      throw new Error(Array.isArray(msg) ? msg.join(', ') : (msg || 'OCR error'));
    }
    return String(res.data?.ParsedResults?.[0]?.ParsedText || '').trim();
  }

  let text = '';
  try {
    text = await once(2);
  } catch (e1) {
    try {
      text = await once(1);
    } catch (e2) {
      throw e1;
    }
  }

  // Clean common OCR noise
  text = text
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[^\S\n]{2,}/g, ' ')
    .trim();
  return text;
}

async function sendDoc(sock, chatJid, mek, buffer, fileName, mimetype) {
  await sock.sendMessage(chatJid, { document: buffer, mimetype, fileName }, { quoted: mek });
}

module.exports = {
  bank: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    const s = settings || sock.botSettings || {};
    const arg = (text || '').trim();
    const low = arg.toLowerCase();
    if (!arg || low === 'show') {
      const card = bankCard(s);
      if (!card) {
        return sock.sendMessage(chatJid, {
          text: isOwner
            ? '❌ No bank set.\n*.bank set Access Bank | 0123456789 | Empire Digitals | note*'
            : '❌ Payment details not configured.'
        }, { quoted: mek });
      }
      return sock.sendMessage(chatJid, { text: card }, { quoted: mek });
    }
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: '❌ Owner only to edit. Use *.bank* to view.' }, { quoted: mek });
    }
    if (low === 'clear') {
      await persist(sock, s, { bankDetails: null });
      return sock.sendMessage(chatJid, { text: '✅ Bank cleared.' }, { quoted: mek });
    }
    if (low.startsWith('set ')) {
      const parts = arg.slice(4).split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length < 3) {
        return sock.sendMessage(chatJid, { text: '❌ *.bank set Bank | AccNo | Name | note*' }, { quoted: mek });
      }
      const bankDetails = {
        bankName: parts[0],
        accountNumber: parts[1].replace(/\s/g, ''),
        accountName: parts[2],
        note: parts[3] || ''
      };
      await persist(sock, s, { bankDetails });
      return sock.sendMessage(chatJid, { text: '✅ Saved.\n\n' + bankCard({ bankDetails }) }, { quoted: mek });
    }
    return sock.sendMessage(chatJid, {
      text: '🏦 *.bank* | *.bank set Bank | Acc | Name | note* | *.bank clear*'
    }, { quoted: mek });
  },
  pay: async (a) => module.exports.bank(a),

  // Header for invoices/PDFs/Word
  // .header Company | tagline | phone | email | address
  header: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: '❌ Owner only.' }, { quoted: mek });
    }
    const s = settings || {};
    const arg = (text || '').trim();
    if (!arg || arg.toLowerCase() === 'show') {
      const h = getHeader(s);
      return sock.sendMessage(chatJid, {
        text: `🏢 *Document header*\n*Title:* ${h.title}\n*Subtitle:* ${h.subtitle || '—'}\n*Phone:* ${h.phone || '—'}\n*Email:* ${h.email || '—'}\n*Address:* ${h.address || '—'}\n\nSet:\n*.header Company | tagline | phone | email | address*`
      }, { quoted: mek });
    }
    if (arg.toLowerCase() === 'clear') {
      await persist(sock, s, { docHeader: null });
      return sock.sendMessage(chatJid, { text: '✅ Header cleared.' }, { quoted: mek });
    }
    const p = arg.split('|').map((x) => x.trim());
    const docHeader = {
      title: p[0] || 'Empire MD',
      subtitle: p[1] || '',
      phone: p[2] || '',
      email: p[3] || '',
      address: p[4] || ''
    };
    await persist(sock, s, { docHeader });
    return sock.sendMessage(chatJid, {
      text: `✅ Header saved for invoices / PDF / Word.\n*${docHeader.title}*`
    }, { quoted: mek });
  },

  away: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) return sock.sendMessage(chatJid, { text: '❌ Owner only.' }, { quoted: mek });
    const s = settings || {};
    const arg = (text || '').trim();
    const low = arg.toLowerCase();
    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `💤 *Away* ${s.awayOn ? 'ON' : 'OFF'}\n_${s.awayMessage || 'I am currently away.'}_\n*.away on|off* or *.away message*`
      }, { quoted: mek });
    }
    if (low === 'on') { await persist(sock, s, { awayOn: true }); return sock.sendMessage(chatJid, { text: '✅ Away ON' }, { quoted: mek }); }
    if (low === 'off') { await persist(sock, s, { awayOn: false }); return sock.sendMessage(chatJid, { text: '✅ Away OFF' }, { quoted: mek }); }
    await persist(sock, s, { awayOn: true, awayMessage: arg });
    return sock.sendMessage(chatJid, { text: `✅ Away ON:\n_${arg}_` }, { quoted: mek });
  },
  busy: async (a) => module.exports.away(a),

  invoice: async ({ sock, chatJid, mek, text, settings }) => {
    const s = settings || sock.botSettings || {};
    let arg = (text || '').trim();
    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `🧾 *Invoice*\n*.invoice Item | qty | price ; Item2 | qty | price*\n*.invoice pdf ...* → styled PDF\n\nSet brand header:\n*.header Company | tagline | phone | email | address*`
      }, { quoted: mek });
    }
    let wantPdf = false;
    if (/^pdf\s+/i.test(arg)) { wantPdf = true; arg = arg.replace(/^pdf\s+/i, '').trim(); }
    const { rows, total } = parseLineItems(arg);
    if (!rows.length) {
      return sock.sendMessage(chatJid, { text: '❌ Use: *Item | qty | price*' }, { quoted: mek });
    }
    const body = invoiceText(s.botName || 'Empire MD', rows, total, s, 'INVOICE');
    await sock.sendMessage(chatJid, { text: body }, { quoted: mek });
    if (wantPdf) {
      const pdf = await makeStyledInvoicePdf({ kind: 'INVOICE', rows, total, settings: s });
      if (pdf) await sendDoc(sock, chatJid, mek, pdf, `invoice-${Date.now()}.pdf`, 'application/pdf');
      else await sock.sendMessage(chatJid, { text: '_Install: npm i pdfkit_' }, { quoted: mek });
    }
  },
  inv: async (a) => module.exports.invoice(a),

  receipt: async ({ sock, chatJid, mek, text, settings }) => {
    const s = settings || sock.botSettings || {};
    let arg = (text || '').trim();
    if (!arg) {
      return sock.sendMessage(chatJid, {
        text: `🧾 *Receipt*\n*.receipt amount | description | payer*\n*.receipt pdf 25000 | Logo | John*`
      }, { quoted: mek });
    }
    let wantPdf = false;
    if (/^pdf\s+/i.test(arg)) { wantPdf = true; arg = arg.replace(/^pdf\s+/i, '').trim(); }
    const parts = arg.split('|').map((p) => p.trim());
    const amount = Number(String(parts[0] || '').replace(/,/g, '')) || 0;
    const desc = parts[1] || 'Payment';
    const payer = parts[2] || '';
    if (!amount) return sock.sendMessage(chatJid, { text: '❌ Amount required.' }, { quoted: mek });
    const rows = [{ item: desc, qty: 1, price: amount, sub: amount }];
    const body = invoiceText(s.botName || 'Empire MD', rows, amount, s, 'RECEIPT');
    const extra = payer ? body.replace('📅', `*From:* ${payer}\n📅`) : body;
    await sock.sendMessage(chatJid, { text: extra }, { quoted: mek });
    if (wantPdf) {
      const pdf = await makeStyledInvoicePdf({
        kind: 'RECEIPT',
        rows,
        total: amount,
        settings: s,
        receiptMeta: { amount, desc, payer }
      });
      if (pdf) await sendDoc(sock, chatJid, mek, pdf, `receipt-${Date.now()}.pdf`, 'application/pdf');
      else await sock.sendMessage(chatJid, { text: '_Install: npm i pdfkit_' }, { quoted: mek });
    }
  },
  rcpt: async (a) => module.exports.receipt(a),

  ocr: async ({ sock, chatJid, mek, text, settings }) => {
    const mode = (text || '').trim().toLowerCase() || 'text';
    const buf = await downloadQuotedImage(mek);
    if (!buf?.length) {
      return sock.sendMessage(chatJid, {
        text: `🔍 *OCR*\nReply to an *image*:\n*.ocr* text · *.ocr pdf* · *.ocr doc* · *.ocr both*`
      }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: '🔍 Advanced OCR running…' }, { quoted: mek });
    let extracted;
    try {
      extracted = await runOcrAdvanced(buf);
    } catch (e) {
      return sock.sendMessage(chatJid, {
        text: `❌ OCR failed: ${e.message}\n_Add OCR_API_KEY to .env for better limits._`
      }, { quoted: mek });
    }
    if (!extracted) {
      return sock.sendMessage(chatJid, { text: '❌ No text found. Use a clearer image.' }, { quoted: mek });
    }
    const chunk = extracted.length > 3500 ? extracted.slice(0, 3500) + '\n_[truncated]_' : extracted;
    await sock.sendMessage(chatJid, { text: `📄 *OCR*\n━━━━━━━━━━━━━━━━\n${chunk}` }, { quoted: mek });

    const s = settings || sock.botSettings || {};
    if (mode === 'pdf' || mode === 'both') {
      const pdf = await makePlainPdf('OCR Export', extracted, s);
      if (pdf) await sendDoc(sock, chatJid, mek, pdf, `ocr-${Date.now()}.pdf`, 'application/pdf');
      else await sock.sendMessage(chatJid, { text: '_npm i pdfkit_' }, { quoted: mek });
    }
    if (['doc', 'docx', 'word', 'both'].includes(mode)) {
      const docx = await makeDocxBuffer('OCR Export', extracted, s);
      if (docx) {
        await sendDoc(sock, chatJid, mek, docx, `ocr-${Date.now()}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      } else {
        await sock.sendMessage(chatJid, { text: '_npm i docx_' }, { quoted: mek });
      }
    }
  },

  pdf: async ({ sock, chatJid, mek, text, settings }) => {
    const body = (text || '').trim();
    if (!body) {
      return sock.sendMessage(chatJid, {
        text: '📄 *.pdf Your text...*\nUses your *.header* brand on the first page.'
      }, { quoted: mek });
    }
    const pdf = await makePlainPdf('Document', body, settings || sock.botSettings);
    if (!pdf) {
      return sock.sendMessage(chatJid, { text: '❌ Run: `npm install pdfkit`' }, { quoted: mek });
    }
    await sendDoc(sock, chatJid, mek, pdf, `doc-${Date.now()}.pdf`, 'application/pdf');
  },

  doc: async ({ sock, chatJid, mek, text, settings }) => {
    const body = (text || '').trim();
    if (!body) {
      return sock.sendMessage(chatJid, {
        text: '📝 *.doc Your text...*\nAliases: *.word* *.docx*'
      }, { quoted: mek });
    }
    const docx = await makeDocxBuffer('Document', body, settings || sock.botSettings);
    if (!docx) {
      return sock.sendMessage(chatJid, { text: '❌ Run: `npm install docx`' }, { quoted: mek });
    }
    await sendDoc(sock, chatJid, mek, docx, `doc-${Date.now()}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  },
  word: async (a) => module.exports.doc(a),
  docx: async (a) => module.exports.doc(a)
};
