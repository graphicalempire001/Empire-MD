// Empire MD - Global Configuration

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
