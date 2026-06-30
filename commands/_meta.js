// commands/_meta.js — describe every command once; the menu builds itself from this.
// category → list of { cmd, alias, desc, owner }
module.exports = {
    "📥 MEDIA & DOWNLOADS": [
        { cmd: "sticker", alias: ["s"], desc: "Create a sticker from replied image/video" },
        { cmd: "play", alias: [], desc: "Search & download an MP3 song" },
        { cmd: "ytmp3", alias: [], desc: "Download a YouTube video as MP3" },
        { cmd: "ytmp4", alias: ["video"], desc: "Download a YouTube video as MP4" },
        { cmd: "ig", alias: ["insta"], desc: "Download Instagram reels/posts" },
        { cmd: "tt", alias: ["tiktok"], desc: "Download TikTok videos (no watermark)" },
        { cmd: "fb", alias: ["fbdl"], desc: "Download Facebook HD videos" }
    ],
    "👑 OWNER & SYSTEM": [
        { cmd: "setprefix", alias: ["sp"], desc: "Change the command prefix", owner: true },
        { cmd: "setmode", alias: ["mode"], desc: "Toggle public/private mode", owner: true },
        { cmd: "broadcast", alias: ["bc"], desc: "Broadcast a message to all groups", owner: true },
        { cmd: "setname", alias: ["sn"], desc: "Update the bot display name", owner: true },
        { cmd: "setbio", alias: ["sb"], desc: "Update the bot bio/status", owner: true }
    ],
    "👥 GROUP & MODERATION": [
        { cmd: "link", alias: ["g-link"], desc: "Get the group invite link" },
        { cmd: "kick", alias: [], desc: "Remove a participant", owner: true },
        { cmd: "add", alias: [], desc: "Add a participant", owner: true },
        { cmd: "antilink", alias: [], desc: "Antilink: off/warn/delete/kick", owner: true },
        { cmd: "close", alias: [], desc: "Close the group (admins only)", owner: true },
        { cmd: "open", alias: [], desc: "Open the group", owner: true },
        { cmd: "tagall", alias: ["everyone"], desc: "Mention everyone" }
    ],
    "⚙️ AUTO & PRESENCE": [
        { cmd: "auto", alias: ["presence"], desc: "typing / recording / online toggles", owner: true },
        { cmd: "autostatusview", alias: [], desc: "Toggle auto-view statuses", owner: true },
        { cmd: "autostatusreact", alias: [], desc: "Toggle auto-react to statuses", owner: true }
    ],
    "🎭 FUN": [
        { cmd: "meme", alias: [], desc: "Fetch a random meme" },
        { cmd: "joke", alias: [], desc: "Fetch a random joke" },
        { cmd: "fact", alias: [], desc: "Fetch a random fact" },
        { cmd: "lyrics", alias: [], desc: "Fetch song lyrics" }
    ],
    "🛠️ UTILITY": [
        { cmd: "ping", alias: ["p"], desc: "Check bot latency" },
        { cmd: "info", alias: ["system"], desc: "System diagnostics & uptime" },
        { cmd: "help", alias: ["h", "menu"], desc: "Show this menu" }
    ]
};
