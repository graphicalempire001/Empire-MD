/**
 * Empire MD — Business tools
 * .bank / .pay / .away / .invoice / .receipt / .ocr / .pdf / .doc
 *
 * Optional deps (recommended on VPS):
 *   npm install pdfkit docx
 * OCR uses OCR.space (set OCR_API_KEY in .env, or free demo key).
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const { updateSettings } = require('../lib/database');

async function persist(sock, settings, patch) {
  const merged = { ...(settings || {}), ...patch };
  sock.botSettings = merged;
  if (sock.sessionId) {
    try {
      await updateSettings(sock.sessionId, patch);
    } catch (e) {
      console.error('business persist:', e.message);
    }
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
  const x = Number(n) || 0;
  return '₦' + x.toLocaleString('en-NG');
}

function parseLineItems(text) {
  const lines = String(text || '')
    .split(';')
    .map((l) => l.trim())
    .filter(Boolean);
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

function invoiceBody(botName, rows, total, s, title = 'INVOICE') {
  let body = `🧾 *${title} — ${botName}*\n`;
  body += `📅 ${new Date().toLocaleString()}\n`;
  body += `━━━━━━━━━━━━━━━━━━━━\n`;
  rows.forEach((r, i) => {
    body += `${i + 1}. *${r.item}*\n`;
    body += `   ${r.qty} × ${naira(r.price)} = *${naira(r.sub)}*\n`;
  });
  body += `━━━━━━━━━━━━━━━━━━━━\n`;
  body += `*Total: ${naira(total)}*\n`;
  const card = bankCard(s);
  if (card) body += `\n${card}`;
  return body;
}

async function downloadQuotedImage(mek) {
  const ctx = mek.message?.extendedTextMessage?.contextInfo;
  const q = ctx?.quotedMessage;
  if (!q) return null;
  const node =
    q.imageMessage ||
    q.viewOnceMessage?.message?.imageMessage ||
    q.viewOnceMessageV2?.message?.imageMessage ||
    q.documentMessage;
  if (!node) return null;
  const isImage =
    q.imageMessage ||
    (q.documentMessage && String(q.documentMessage.mimetype || '').startsWith('image/'));
  if (!isImage && !q.imageMessage) {
    // allow document images
    if (!q.documentMessage?.mimetype?.startsWith('image/')) return null;
  }
  const type = q.imageMessage ? 'image' : 'document';
  const stream = await downloadContentFromMessage(node, type === 'document' ? 'document' : 'image');
  let buf = Buffer.from([]);
  for await (const chunk of stream) buf = Buffer.concat([buf, chunk]);
  return buf;
}

async function runOcr(imageBuffer) {
  const apiKey = process.env.OCR_API_KEY || 'helloworld';
  const FormData = require('form-data');
  let form;
  try {
    form = new FormData();
  } catch (_) {
    // form-data may not be installed — use multipart via axios native workaround
  }

  if (form) {
    form.append('language', 'eng');
    form.append('isOverlayRequired', 'false');
    form.append('detectOrientation', 'true');
    form.append('scale', 'true');
    form.append('OCREngine', '2'); // better for mixed / handwriting-ish
    form.append('file', imageBuffer, { filename: 'scan.jpg', contentType: 'image/jpeg' });
    const res = await axios.post('https://api.ocr.space/parse/image', form, {
      headers: { ...form.getHeaders(), apikey: apiKey },
      maxBodyLength: Infinity,
      timeout: 60000
    });
    const parsed = res.data?.ParsedResults?.[0]?.ParsedText || '';
    if (res.data?.IsErroredOnProcessing) {
      throw new Error(res.data?.ErrorMessage?.[0] || res.data?.ErrorMessage || 'OCR failed');
    }
    return String(parsed).trim();
  }

  // Fallback: base64 JSON API
  const b64 = imageBuffer.toString('base64');
  const res = await axios.post(
    'https://api.ocr.space/parse/image',
    {
      language: 'eng',
      isOverlayRequired: false,
      base64Image: 'data:image/jpeg;base64,' + b64,
      OCREngine: 2,
      scale: true,
      detectOrientation: true
    },
    {
      headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      timeout: 60000
    }
  );
  if (res.data?.IsErroredOnProcessing) {
    throw new Error(res.data?.ErrorMessage?.[0] || res.data?.ErrorMessage || 'OCR failed');
  }
  return String(res.data?.ParsedResults?.[0]?.ParsedText || '').trim();
}

async function makePdfBuffer(title, bodyText) {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (_) {
    return null;
  }
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(16).text(title, { underline: true });
      doc.moveDown();
      doc.fontSize(11).text(bodyText || '', { align: 'left' });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function makeDocxBuffer(title, bodyText) {
  let Document, Packer, Paragraph, TextRun;
  try {
    ({ Document, Packer, Paragraph, TextRun } = require('docx'));
  } catch (_) {
    return null;
  }
  const paragraphs = String(bodyText || '')
    .split(/\n/)
    .map(
      (line) =>
        new Paragraph({
          children: [new TextRun({ text: line || ' ', size: 22 })]
        })
    );
  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            children: [new TextRun({ text: title, bold: true, size: 28 })]
          }),
          new Paragraph({ children: [new TextRun({ text: ' ' })] }),
          ...paragraphs
        ]
      }
    ]
  });
  return Buffer.from(await Packer.toBuffer(doc));
}

async function sendDoc(sock, chatJid, mek, buffer, fileName, mimetype) {
  await sock.sendMessage(
    chatJid,
    {
      document: buffer,
      mimetype,
      fileName
    },
    { quoted: mek }
  );
}

module.exports = {
  // ─── BANK ───────────────────────────────────────────
  bank: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    const s = settings || sock.botSettings || {};
    const arg = (text || '').trim();
    const low = arg.toLowerCase();

    if (!arg || low === 'show') {
      const card = bankCard(s);
      if (!card) {
        return sock.sendMessage(
          chatJid,
          {
            text: isOwner
              ? '❌ No bank set.\n*.bank set Access Bank | 0123456789 | Empire Digitals | optional note*'
              : '❌ Payment details not configured.'
          },
          { quoted: mek }
        );
      }
      return sock.sendMessage(chatJid, { text: card }, { quoted: mek });
    }

    if (!isOwner) {
      return sock.sendMessage(
        chatJid,
        { text: '❌ Only owner can change bank details. Use *.bank* to view.' },
        { quoted: mek }
      );
    }

    if (low === 'clear') {
      await persist(sock, s, { bankDetails: null });
      return sock.sendMessage(chatJid, { text: '✅ Bank details cleared.' }, { quoted: mek });
    }

    if (low.startsWith('set ')) {
      const parts = arg
        .slice(4)
        .split('|')
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 3) {
        return sock.sendMessage(
          chatJid,
          { text: '❌ *.bank set Bank | AccountNumber | Account Name | note*' },
          { quoted: mek }
        );
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

    return sock.sendMessage(
      chatJid,
      {
        text: `🏦 *Bank*\n👉 *.bank*\n👉 *.bank set Bank | Acc | Name | note*\n👉 *.bank clear*`
      },
      { quoted: mek }
    );
  },
  pay: async (args) => module.exports.bank(args),

  // ─── AWAY ───────────────────────────────────────────
  away: async ({ sock, chatJid, mek, text, isOwner, settings }) => {
    if (!isOwner) {
      return sock.sendMessage(chatJid, { text: '❌ Owner only.' }, { quoted: mek });
    }
    const s = settings || {};
    const arg = (text || '').trim();
    const low = arg.toLowerCase();
    if (!arg) {
      return sock.sendMessage(
        chatJid,
        {
          text: `💤 *Away*\nStatus: *${s.awayOn ? 'ON' : 'OFF'}*\nMessage: _${
            s.awayMessage || 'I am currently away. I will reply soon.'
          }_\n\n👉 *.away on|off*\n👉 *.away Your message*`
        },
        { quoted: mek }
      );
    }
    if (low === 'on' || low === 'enable') {
      await persist(sock, s, { awayOn: true });
      return sock.sendMessage(chatJid, { text: '✅ Away ON' }, { quoted: mek });
    }
    if (low === 'off' || low === 'disable') {
      await persist(sock, s, { awayOn: false });
      return sock.sendMessage(chatJid, { text: '✅ Away OFF' }, { quoted: mek });
    }
    await persist(sock, s, { awayOn: true, awayMessage: arg });
    return sock.sendMessage(chatJid, { text: `✅ Away ON:\n_${arg}_` }, { quoted: mek });
  },
  busy: async (args) => module.exports.away(args),

  // ─── INVOICE ────────────────────────────────────────
  // .invoice Item | qty | price ; Item2 | qty | price
  // .invoice pdf Item | qty | price   → also send PDF if pdfkit installed
  invoice: async ({ sock, chatJid, mek, text, settings }) => {
    const s = settings || sock.botSettings || {};
    let arg = (text || '').trim();
    if (!arg) {
      return sock.sendMessage(
        chatJid,
        {
          text: `🧾 *Invoice*\n*.invoice Item | qty | price*\nMulti: separate with *;*\n\n*.invoice pdf Logo | 1 | 25000 ; Hosting | 1 | 10000*\n\nAlias: *.inv*`
        },
        { quoted: mek }
      );
    }
    let wantPdf = false;
    if (/^pdf\s+/i.test(arg)) {
      wantPdf = true;
      arg = arg.replace(/^pdf\s+/i, '').trim();
    }
    const { rows, total } = parseLineItems(arg);
    if (!rows.length) {
      return sock.sendMessage(
        chatJid,
        { text: '❌ Parse error. Use: *Item | qty | price*' },
        { quoted: mek }
      );
    }
    const botName = s.botName || 'Empire MD';
    const body = invoiceBody(botName, rows, total, s, 'INVOICE');
    await sock.sendMessage(chatJid, { text: body }, { quoted: mek });

    if (wantPdf) {
      const plain = body.replace(/\*/g, '');
      const pdf = await makePdfBuffer(`Invoice — ${botName}`, plain);
      if (pdf) {
        await sendDoc(sock, chatJid, mek, pdf, `invoice-${Date.now()}.pdf`, 'application/pdf');
      } else {
        await sock.sendMessage(
          chatJid,
          { text: '_PDF skipped — run: npm install pdfkit_' },
          { quoted: mek }
        );
      }
    }
  },
  inv: async (args) => module.exports.invoice(args),

  // ─── RECEIPT ────────────────────────────────────────
  // .receipt 15000 | Logo payment | optional payer name
  // .receipt pdf 15000 | Deposit
  receipt: async ({ sock, chatJid, mek, text, settings }) => {
    const s = settings || sock.botSettings || {};
    let arg = (text || '').trim();
    if (!arg) {
      return sock.sendMessage(
        chatJid,
        {
          text: `🧾 *Receipt*\n*.receipt amount | description | payer*\n*.receipt pdf 25000 | Logo design | John*\n\nAlias: *.rcpt*`
        },
        { quoted: mek }
      );
    }
    let wantPdf = false;
    if (/^pdf\s+/i.test(arg)) {
      wantPdf = true;
      arg = arg.replace(/^pdf\s+/i, '').trim();
    }
    const parts = arg.split('|').map((p) => p.trim());
    const amount = Number(String(parts[0] || '').replace(/,/g, '')) || 0;
    const desc = parts[1] || 'Payment';
    const payer = parts[2] || '';
    if (!amount) {
      return sock.sendMessage(chatJid, { text: '❌ Amount required.' }, { quoted: mek });
    }
    const botName = s.botName || 'Empire MD';
    let body =
      `✅ *RECEIPT — ${botName}*\n` +
      `📅 ${new Date().toLocaleString()}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `*Amount:* ${naira(amount)}\n` +
      `*For:* ${desc}\n` +
      (payer ? `*From:* ${payer}\n` : '') +
      `*Status:* Paid / Recorded\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `_Thank you for your business._`;
    const card = bankCard(s);
    if (card) body += `\n\n${card}`;

    await sock.sendMessage(chatJid, { text: body }, { quoted: mek });
    if (wantPdf) {
      const pdf = await makePdfBuffer(`Receipt — ${botName}`, body.replace(/\*/g, ''));
      if (pdf) {
        await sendDoc(sock, chatJid, mek, pdf, `receipt-${Date.now()}.pdf`, 'application/pdf');
      } else {
        await sock.sendMessage(
          chatJid,
          { text: '_PDF skipped — run: npm install pdfkit_' },
          { quoted: mek }
        );
      }
    }
  },
  rcpt: async (args) => module.exports.receipt(args),

  // ─── OCR (reply to image) ───────────────────────────
  // .ocr          → text only
  // .ocr pdf      → text + PDF
  // .ocr doc      → text + Word .docx
  // .ocr both     → text + PDF + Word
  ocr: async ({ sock, chatJid, mek, text }) => {
    const mode = (text || '').trim().toLowerCase() || 'text';
    const buf = await downloadQuotedImage(mek);
    if (!buf || !buf.length) {
      return sock.sendMessage(
        chatJid,
        {
          text: `🔍 *OCR*\nReply to an *image* (photo / scan / handwriting):\n👉 *.ocr* — text\n👉 *.ocr pdf* — + PDF\n👉 *.ocr doc* — + Word\n👉 *.ocr both* — PDF + Word`
        },
        { quoted: mek }
      );
    }

    await sock.sendMessage(chatJid, { text: '🔍 Reading image…' }, { quoted: mek });
    let extracted;
    try {
      extracted = await runOcr(buf);
    } catch (e) {
      return sock.sendMessage(
        chatJid,
        { text: `❌ OCR failed: ${e.message}\n_Set OCR_API_KEY in .env for higher limits._` },
        { quoted: mek }
      );
    }
    if (!extracted) {
      return sock.sendMessage(
        chatJid,
        { text: '❌ No text detected. Try a clearer photo.' },
        { quoted: mek }
      );
    }

    const chunk =
      extracted.length > 3500 ? extracted.slice(0, 3500) + '\n\n_[truncated]_' : extracted;
    await sock.sendMessage(
      chatJid,
      { text: `📄 *OCR result*\n━━━━━━━━━━━━━━━━━━━━\n${chunk}` },
      { quoted: mek }
    );

    const wantPdf = mode === 'pdf' || mode === 'both';
    const wantDoc = mode === 'doc' || mode === 'docx' || mode === 'word' || mode === 'both';

    if (wantPdf) {
      const pdf = await makePdfBuffer('OCR Export', extracted);
      if (pdf) {
        await sendDoc(sock, chatJid, mek, pdf, `ocr-${Date.now()}.pdf`, 'application/pdf');
      } else {
        await sock.sendMessage(chatJid, { text: '_Install pdfkit: npm i pdfkit_' }, { quoted: mek });
      }
    }
    if (wantDoc) {
      const docx = await makeDocxBuffer('OCR Export', extracted);
      if (docx) {
        await sendDoc(
          sock,
          chatJid,
          mek,
          docx,
          `ocr-${Date.now()}.docx`,
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        );
      } else {
        await sock.sendMessage(chatJid, { text: '_Install docx: npm i docx_' }, { quoted: mek });
      }
    }
  },

  // ─── PDF from pasted text ───────────────────────────
  // .pdf Your long text here...
  pdf: async ({ sock, chatJid, mek, text }) => {
    const body = (text || '').trim();
    if (!body) {
      return sock.sendMessage(
        chatJid,
        {
          text: `📄 *PDF maker*\n*.pdf Your text here...*\nCreates a PDF document from the message.`
        },
        { quoted: mek }
      );
    }
    const pdf = await makePdfBuffer('Empire Document', body);
    if (!pdf) {
      return sock.sendMessage(
        chatJid,
        { text: '❌ PDF engine missing. On VPS run:\n`npm install pdfkit`' },
        { quoted: mek }
      );
    }
    await sendDoc(sock, chatJid, mek, pdf, `doc-${Date.now()}.pdf`, 'application/pdf');
  },

  // ─── Word from pasted text ──────────────────────────
  // .doc Your text...   /  .word / .docx
  doc: async ({ sock, chatJid, mek, text }) => {
    const body = (text || '').trim();
    if (!body) {
      return sock.sendMessage(
        chatJid,
        {
          text: `📝 *Word maker*\n*.doc Your text here...*\nCreates a Microsoft Word (.docx) file.\nAliases: *.word* *.docx*`
        },
        { quoted: mek }
      );
    }
    const docx = await makeDocxBuffer('Empire Document', body);
    if (!docx) {
      return sock.sendMessage(
        chatJid,
        { text: '❌ Word engine missing. On VPS run:\n`npm install docx`' },
        { quoted: mek }
      );
    }
    await sendDoc(
      sock,
      chatJid,
      mek,
      docx,
      `doc-${Date.now()}.docx`,
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
  },
  word: async (args) => module.exports.doc(args),
  docx: async (args) => module.exports.doc(args)
};
