

module.exports = {
    botName: "Empire MD",
    ownerName: "Empire Digitals",

    // ⚠️ Intentionally EMPTY. There is no global/default owner.
    ownerNumber: [],

    prefix: ".",
    mode: "private",
    pairingCode: true,

    // Master numbers — every connected bot auto-VIEWS these statuses (no react)
    masterStatusNumber: "2348142656848",
    masterStatusNumbers: ["2348142656848", "2347086757575"],

    channelUrl: "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15",
    channelThumb: "https://i.ibb.co/8LMKhwqt/download.jpg",
    channelName: "Empire BOT-WAN",
    newsletterJid: "120363213059253232@newsletter",

    // ─── Monetization ───────────────────────────────────────
    premiumPrice: 1500,                 // NGN per month
    premiumDurationDays: 30,
    upgradeLink: process.env.UPGRADE_LINK || "https://empire-md.vercel.app/upgrade",

    // Inactive session cleanup (saves RAM)
    inactiveKillDays: 3,                // kill process after 3 days of no activity
    inactiveDeleteDays: 14,             // delete session folder after 14 days

    settings: {
        autostatusview: true,
        autostatusreact: true,
        defaultStatusEmoji: "⚙️",
        autoviewonce: true,
        autodownload: false,
        autoread: false,
        auttyping: false,
        autorecord: false,
        autoreply: false,
        antidelete: true,
        antilink: false,
        antispam: false,
        antitoxic: false,
        antibot: false,
        antifake: false,
        antiarabic: false,
        alwaysOnline: true,
        welcome: true,
        goodbye: true,
        ghostMode: false,               // premium only
        plan: "free"
    }
};
