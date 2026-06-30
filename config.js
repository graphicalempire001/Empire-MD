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

    prefix: ".",            // Default prefix (per-bot prefix overrides this)
    mode: "private",        // New bots start private until their owner opens them
    pairingCode: true,      // Pairing code flow enabled
    channelUrl: "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15", // Official BOT-WAN WhatsApp Channel

    // Core default user settings (applied to a new bot, then customizable per-session)
    settings: {
        autostatusview: true,
        autostatusreact: true,
        defaultStatusEmoji: "💖",
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
