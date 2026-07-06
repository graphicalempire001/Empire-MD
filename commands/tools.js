const axios = require('axios');
const PDFDocument = require('pdfkit');
const FormData = require('form-data');
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');

async function downloadBuffer(node, type) {
  const stream = await downloadContentFromMessage(node[type], type.replace('Message', ''));
  let buffer = Buffer.from([]);
  for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
  return buffer;
}

function getQuoted(mek) {
  if (mek.quoted && mek.quoted.message) return { message: mek.quoted.message, type: mek.quoted.type };
  let q = mek.message?.extendedTextMessage?.contextInfo?.quotedMessage;
  if (!q) return null;
  while (q?.ephemeralMessage || q?.viewOnceMessage || q?.viewOnceMessageV2 || q?.viewOnceMessageV2Extension) {
    q = q.ephemeralMessage?.message || q.viewOnceMessage?.message || q.viewOnceMessageV2?.message || q.viewOnceMessageV2Extension?.message;
  }
  if (!q) return null;
  return { message: q, type: Object.keys(q)[0] };
}

module.exports = {
  ocr: async ({ sock, chatJid, mek }) => {
    const q = getQuoted(mek);
    if (!q || q.type !== 'imageMessage') {
      return sock.sendMessage(chatJid, { text: "❌ Please reply to an *image* with `.ocr` to extract text." }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "🔍 Analyzing image and extracting text..." }, { quoted: mek });
    try {
      const buffer = await downloadBuffer(q.message, 'imageMessage');
      const form = new FormData();
      form.append('file', buffer, { filename: 'image.jpg', contentType: 'image/jpeg' });
      form.append('OCREngine', '2');
      const res = await axios.post('https://api.ocr.space/parse/image', form, {
        headers: { ...form.getHeaders(), apikey: process.env.OCR_API_KEY || 'helloworld' },
        timeout: 30000,
      });
      const parsedText = res.data?.ParsedResults?.[0]?.ParsedText?.trim();
      if (!parsedText) throw new Error("No readable text found in the image.");
      await sock.sendMessage(chatJid, { text: "📝 *[OCR EXTRACTED TEXT]*:\n\n" + parsedText }, { quoted: mek });
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ OCR Failed: " + e.message }, { quoted: mek });
    }
  },
  pdf: async ({ sock, chatJid, mek, text }) => {
    const q = getQuoted(mek);
    let rawText = text;
    if (!rawText && q && q.message?.conversation) rawText = q.message.conversation;
    else if (!rawText && q && q.message?.extendedTextMessage?.text) rawText = q.message.extendedTextMessage.text;
    if (!rawText && (!q || q.type !== 'imageMessage')) {
      return sock.sendMessage(chatJid, { text: "❌ Provide text, reply to text, or reply to an image to convert to PDF!\n\n*Usage:*\n• .pdf Hello\n• Reply to msg with .pdf" }, { quoted: mek });
    }
    await sock.sendMessage(chatJid, { text: "⏳ Generating professional PDF document..." }, { quoted: mek });
    try {
      const doc = new PDFDocument({ margin: 50 });
      const buffers = [];
      doc.on('data', buffers.push.bind(buffers));
      doc.on('end', async () => {
        const pdfBuffer = Buffer.concat(buffers);
        const fileName = 'Empire_MD_' + Date.now().toString().slice(-6) + '.pdf';
        await sock.sendMessage(chatJid, { document: pdfBuffer, mimetype: 'application/pdf', fileName: fileName, caption: '📄 Here is your generated PDF document!' }, { quoted: mek });
      });
      doc.fillColor('#1A365D').fontSize(24).text('EMPIRE MD', { align: 'center' });
      doc.moveDown();
      doc.strokeColor('#CCCCCC').lineWidth(1).moveTo(50, doc.y).lineTo(562, doc.y).stroke();
      doc.moveDown(2);
      if (q && q.type === 'imageMessage') {
        const imgBuffer = await downloadBuffer(q.message, 'imageMessage');
        doc.fillColor('#333333').fontSize(12).text('Attached Image Content:', { underline: true });
        doc.moveDown();
        doc.image(imgBuffer, { fit: [500, 400], align: 'center', valign: 'center' });
      } else {
        doc.fillColor('#333333').fontSize(12).text(rawText, { align: 'left', lineGap: 4 });
      }
      doc.moveDown(3);
      doc.fontSize(10).fillColor('#777777').text('Generated on: ' + new Date().toLocaleString() + ' | Powered by Empire-MD WhatsApp Bot', { align: 'center' });
      doc.end();
    } catch (e) {
      await sock.sendMessage(chatJid, { text: "❌ PDF compilation failed: " + e.message }, { quoted: mek });
    }
  }
};
