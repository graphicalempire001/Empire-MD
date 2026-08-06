const puppeteer = (() => {
    try {
        return require("puppeteer");
    } catch (e) {
        console.error(e.stack);
        return null;
    }
})();

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

        return await page.pdf({
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
    } finally {
        await page.close().catch(() => {});
    }
}

async function closeBrowser() {
    if (!browserPromise) return;

    try {
        const browser = await browserPromise;
        await browser.close();
    } catch (_) {}

    browserPromise = null;
}

module.exports = {
    htmlToPdfBuffer,
    closeBrowser
};
