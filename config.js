// Empire MD - Global Configuration

module.exports = {
    botName: "Empire MD",
    ownerName: "Empire Owner",
    ownerNumber: ["2348142656848"], // Customizable during onboarding
    prefix: ".", // Default prefix
    mode: "private", // Starts in private mode for user security
    pairingCode: true, // Pairing code enabled by default
    channelUrl: "https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15", // Official BOT-WAN WhatsApp Channel

    // Core default user settings
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
