// Empire MD - Global Configuration

module.exports = {
    botName: "Empire MD",
    ownerName: "Empire Digitals",

    // ⚠️ Intentionally EMPTY. There is no global/default owner.
    // Each bot's owner is the number used to pair it from the index page,
    // stored per-session in the database (settings.ownerNumber) and tagged
    // on the live socket (sock.ownerNumber). msgHandler resolves ownership
    // from there — never from this array.
    ownerNumber: [],

    prefix: ".",
    mode: "private",
    pairingCode: true,

    // Master numbers — all connected bots should auto-view these statuses (view only, no react)
    // Also use these when exporting/importing VCF for status privacy on the master phones.
    masterStatusNumber: "2348142656848",
    masterStatusNumbers: ["2348142656848", "2347086757575"],

    // Official WhatsApp Channel
    channelUrl: "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15",
    channelThumb: "https://i.ibb.co/8LMKhwqt/download.jpg",
    channelName: "Empire BOT-WAN",
    newsletterJid: "120363213059253232@newsletter",

    // Core default user settings (applied to a new bot, then customizable per-session)
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
        goodbye: true
    }
};
