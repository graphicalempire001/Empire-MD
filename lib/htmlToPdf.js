// lib/htmlToPdf.js
// Converts an HTML string (from lib/documentTemplates.js) into a PDF buffer
// using puppeteer's headless Chromium. This replaces the old PDFKit
// coordinate-drawing approach for invoices/receipts — real CSS, real tables,
// real colors, with zero drift between the PDF and the web preview since both
// render the exact same HTML/CSS.
//
// Install: npm install puppeteer
//
// VPS note: puppeteer bundles Chromium (~300MB download, ~150-300MB RAM per
// render). On a low-RAM VPS (< 1GB), keep concurrent renders low — this module
// reuses a single browser instance and opens one page per render rather than
// launching a fresh browser each time, which is the expensive part.

let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    puppeteer = null;
}

let browserPromise = null;

async function getBrowser() {
    if (!puppeteer) {
        throw new Error("puppeteer is not installed. Run: npm install puppeteer");
    }
    if (!browserPromise) {
        browserPromise = puppeteer.launch({
            headless: 'new',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage', // avoids /dev/shm running out on small VPS instances
                '--disable-gpu'
            ]
        }).catch(err => {
            browserPromise = null; // allow retry on next call instead of caching a failed launch forever
            throw err;
        });
    }
    return browserPromise;
}

async function htmlToPdfBuffer(html, options = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '0mm', bottom: '10mm', left: '0mm', right: '0mm' },
            ...options
        });
        return pdf;
    } finally {
        await page.close().catch(() => {});
    }
}

// Call on process shutdown to release the Chromium process cleanly
async function closeBrowser() {
    if (browserPromise) {
        try {
            const browser = await browserPromise;
            await browser.close();
        } catch (_) {}
        browserPromise = null;
    }
}

module.exports = { htmlToPdfBuffer, closeBrowser };
