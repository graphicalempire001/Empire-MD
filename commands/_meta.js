module.exports = {
    "📥 MEDIA & DOWNLOADS": [
        { cmd: "sticker", alias: ["s"], desc: "Create sticker from image/video" },
        { cmd: "play", alias: [], desc: "Search & download song as document" },
        { cmd: "ytmp3", alias: [], desc: "Download YouTube as MP3" },
        { cmd: "ytmp4", alias: ["video"], desc: "Download YouTube as MP4" },
        { cmd: "ig", alias: ["insta"], desc: "Download Instagram reel" },
        { cmd: "tt", alias: ["tiktok"], desc: "Download TikTok video" },
        { cmd: "fb", alias: ["fbdl"], desc: "Download Facebook video" }
    ],
    "👑 OWNER & SYSTEM": [
        { cmd: "setprefix", alias: ["sp"], desc: "Change command prefix", owner: true },
        { cmd: "setmode", alias: ["mode"], desc: "Toggle public/private mode", owner: true },
        { cmd: "broadcast", alias: ["bc"], desc: "Broadcast message", owner: true }
    ],
    "👥 GROUP & MODERATION": [
        { cmd: "link", alias: ["g-link"], desc: "Get group invite link" },
        { cmd: "kick", alias: [], desc: "Remove member" },
        { cmd: "add", alias: [], desc: "Add member" },
        { cmd: "antilink", alias: [], desc: "Antilink settings" }
    ],
    "🎭 FUN": [
        { cmd: "meme", alias: [], desc: "Random meme" },
        { cmd: "joke", alias: [], desc: "Random joke" },
        { cmd: "fact", alias: [], desc: "Random fact" }
    ],
    "🛠️ UTILITY": [
        { cmd: "ping", alias: ["p"], desc: "Check bot latency" },
        { cmd: "info", alias: ["system"], desc: "System information" },
        { cmd: "help", alias: ["h", "menu"], desc: "Show full command menu" },
        { cmd: "list", alias: [], desc: "Show compact command list" },
        { cmd: "pp", alias: [], desc: "Get profile picture" },
        { cmd: "vv", alias: [], desc: "Collect view once media" }
    ]
};
