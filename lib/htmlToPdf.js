const fs = require("fs");

const puppeteer = (() => {
    try {
        return require("puppeteer");
    } catch (e) {
        console.error("Failed to load puppeteer:");
        console.error(e.stack);
        return null;
    }
})();

let browserPromise = null;

function findChrome() {
    const candidates = [
        process.env.PUPPETEER_EXECUTABLE_PATH,
        "/snap/bin/chromium",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable"
    ].filter(Boolean);

    for (const path of candidates) {
        if (fs.existsSync(path)) {
            return path;
        }
    }

    throw new Error(
        "No Chromium/Chrome executable found.\n" +
        "Install Chromium or set PUPPETEER_EXECUTABLE_PATH."
    );
}

async function getBrowser() {
    if (!puppeteer) {
        throw new Error(
            "Puppeteer is not installed.\nRun: npm install puppeteer"
        );
    }

    if (!browserPromise) {
        const executablePath = findChrome();

        console.log("Using Chromium:", executablePath);

        browserPromise = puppeteer.launch({
            executablePath,
            headless: true,
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
        }).catch(err => {
            browserPromise = null;
            throw err;
        });
    }

    return browserPromise;
}

async function htmlToPdfBuffer(html, options = {}) {
    if (typeof html !== "string") {
        throw new TypeError(
            `Expected HTML string but received ${typeof html}`
        );
    }

    const browser = await getBrowser();
    const page = await browser.newPage();

    try {
        await page.setContent(html, {
            waitUntil: "networkidle0",
            timeout: 30000
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

        return Buffer.from(pdf);
    } finally {
        await page.close().catch(() => {});
    }
}

async function closeBrowser() {
    if (!browserPromise) return;

    try {
        const browser = await browserPromise;
        await browser.close();
    } catch (e) {
        console.error(e);
    }

    browserPromise = null;
}

module.exports = {
    htmlToPdfBuffer,
    closeBrowser
};
