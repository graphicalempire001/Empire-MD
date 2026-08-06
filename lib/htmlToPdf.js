// lib/htmlToPdf.js
// Converts an HTML string (from lib/documentTemplates.js) into a PDF buffer
// using Puppeteer's headless Chromium.
//
// Install:
//   npm install puppeteer
//
// Optional .env:
//   PUPPETEER_EXECUTABLE_PATH=/snap/bin/chromium
//
// Ubuntu 24.04 (Snap Chromium):
//   executablePath defaults to /snap/bin/chromium

let puppeteer;
try {
    puppeteer = require('puppeteer');
} catch (e) {
    puppeteer = null;
}

let browserPromise = null;

async function getBrowser() {
    if (!puppeteer) {
        throw new Error(
            "Puppeteer is not installed. Run: npm install puppeteer"
        );
    }

    if (!browserPromise) {
        browserPromise = puppeteer
            .launch({
                executablePath:
                    process.env.PUPPETEER_EXECUTABLE_PATH ||
                    "/snap/bin/chromium",

                headless: "new",

                args: [
                    "--no-sandbox",
                    "--disable-setuid-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-extensions",
                    "--disable-background-networking",
                    "--disable-sync",
                    "--mute-audio",
                    "--hide-scrollbars"
                ]
            })
            .catch((err) => {
                browserPromise = null;
                throw err;
            });
    }

    return browserPromise;
}

async function htmlToPdfBuffer(html, options = {}) {
    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, {
            waitUntil: "networkidle0",
            timeout: 15000
        });

        const pdf = await page.pdf({
            format: "A4",
            printBackground: true,
            margin: {
                top: "0mm",
                right: "0mm",
                bottom: "10mm",
                left: "0mm"
            },
            ...options
        });

        return pdf;
    } finally {
        await page.close().catch(() => {});
    }
}

// Close Chromium cleanly on shutdown
async function closeBrowser() {
    if (!browserPromise) return;

    try {
        const browser = await browserPromise;
        await browser.close();
    } catch (_) {
        // Ignore shutdown errors
    }

    browserPromise = null;
}

module.exports = {
    htmlToPdfBuffer,
    closeBrowser
};
