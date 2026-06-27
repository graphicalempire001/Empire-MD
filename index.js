// Empire MD - Main Entry Point
const { initializeWhatsAppBot } = require('./server');

console.log("🚀 Starting Empire MD WhatsApp Bot...");
initializeWhatsAppBot().catch(err => {
    console.error("❌ Fatal Bot Error:", err);
});