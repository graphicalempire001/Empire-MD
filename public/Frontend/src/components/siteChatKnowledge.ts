/**
 * Empire MD — Site Chat Knowledge Bank
 * Exhaustive, human-readable command & service catalog for the website assistant.
 * Every entry is written so the bot can explain WHAT it does, HOW it works, and HOW to use it.
 */

export const CREATOR_NAME = 'Mishael Yakubu'
export const COMPANY = 'Empire Digitals'
export const CEO_PAGE = 'https://ceo.empiredigitals.space'
export const WA_NUMBER = '2347086757575'
export const PREMIUM_PRICE = '₦1,500'
export const PREMIUM_PERIOD = '30 days'
export const CHANNEL_URL = 'https://whatsapp.com/channel/0029VaI3OXiF6smuq5LxxN15'
export const DEFAULT_PREFIX = '.'

/* ──────────────────────────────────────────────────────────────
   NATURAL TESTIMONIALS (Pidgin-tinged, specific, non-generic)
   ────────────────────────────────────────────────────────────── */
export const TESTIMONIALS: string[] = [
  `💬 *Tunde — Lagos:* "Honestly I almost gave up on WhatsApp bots. Then I paired Empire MD. Status view still dey work even when my phone sleep. Sticker quality clean. Mishael people no dey play."`,
  `💬 *Chioma — Abuja:* "I run a small boutique. .play for music in the group, .antilink so nobody dey dump nonsense links, and the invoice/receipt commands? Customers dey respect us more. Setup was literally two minutes."`,
  `💬 *Emeka — Port Harcourt:* "Premium anti-delete saved me twice already. Someone delete message wey get important number — bot bring am back. Ghost mode too, nobody even know the bot reply. Worth the 1.5k."`,
  `💬 *Aisha — Kano:* "Customer care used to stress me. Auto-reply + AI mode make my number look like real company. Welcome messages for new group members too. Empire Digitals know wetin dem dey do."`,
  `💬 *David — Ibadan:* "I dey use broadcast with channel cards for my church announcements. One command reach all groups. Clean UI on the website, pairing code no stress. Best multi-device bot I try so far."`,
  `💬 *Blessing — Enugu:* "My old bot keep disconnect. Empire MD stable. .vv for view-once pictures wey people send, .send to save status. Premium features no dey joke. Support on WhatsApp also sharp."`,
  `💬 *Kunle — Ikeja:* "I manage three business groups. Tagall, promote, kick, antilink — everything smooth. Free plan already strong; Premium just unlock the serious security tools. No regret."`,
  `💬 *Fatima — Kaduna:* "Bible and Quran commands for our fellowship group. Plus sticker maker the kids love. Pairing from the site took less than the time I dey wait for my previous bot to load."`,
  `💬 *Chidi — Owerri:* "OCR from handwritten note to Word doc? I use am for meeting minutes. PDF and receipt for clients. This no be ordinary bot — na real business tool. Respect to Mishael Yakubu."`,
  `💬 *Grace — Benin:* "Private mode so only I fit use the commands in my personal chat. Public when I want members to use .play. Mode switch easy. Documentation on the site clear. Highly recommend."`,
]

/* ──────────────────────────────────────────────────────────────
   COMMAND CATALOG — full explanations
   Each: name, aliases, category, plan (free|premium), usage, howItWorks, tips
   ────────────────────────────────────────────────────────────── */
export type PlanLevel = 'free' | 'premium' | 'owner'

export interface CommandDoc {
  name: string
  aliases: string[]
  category: string
  plan: PlanLevel
  short: string
  usage: string
  howItWorks: string
  tips?: string
}

export const COMMANDS: CommandDoc[] = [
  // ── Media & Downloads ──────────────────────────────────────
  {
    name: 's',
    aliases: ['sticker'],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Turn any image or short video into a high-quality WhatsApp sticker.',
    usage: 'Reply to an image/video with `.s`  — or send the media with caption `.s` / `.sticker`',
    howItWorks:
      'The bot downloads the media you replied to (or attached), converts it to WebP sticker format with proper WhatsApp dimensions, and sends it back. Works on photos, screenshots, and short video clips.',
    tips: 'For best results use clear images. Very long videos may fail; keep clips short.',
  },
  {
    name: 'play',
    aliases: [],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Search YouTube and download a song as direct MP3/audio.',
    usage: '`.play [song name or artist]`  e.g. `.play Asake Lonely At The Top`',
    howItWorks:
      'Bot searches YouTube for your query, picks the best match, downloads the audio stream, and sends it as a playable voice/audio message in the chat. No need to paste a full link.',
    tips: 'Be specific with title + artist for accurate results. Works in groups and DMs.',
  },
  {
    name: 'ytmp3',
    aliases: [],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Download any YouTube link as MP3 audio.',
    usage: '`.ytmp3 [YouTube URL]`',
    howItWorks: 'Paste a full YouTube watch or share link. Bot extracts audio only and returns an MP3-compatible file.',
  },
  {
    name: 'ytmp4',
    aliases: ['video'],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Download a YouTube video as MP4.',
    usage: '`.ytmp4 [YouTube URL]` or `.video [URL]`',
    howItWorks: 'Same as ytmp3 but returns video file. Quality depends on available streams and size limits.',
  },
  {
    name: 'insta',
    aliases: ['ig'],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Download Instagram reels, posts, or videos.',
    usage: '`.insta [Instagram URL]` or `.ig [URL]`',
    howItWorks: 'Uses public download APIs (Cobalt-style failover) to fetch the media without login. Returns the video/image to the chat.',
  },
  {
    name: 'tiktok',
    aliases: ['tt'],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Download TikTok videos without watermark.',
    usage: '`.tiktok [TikTok URL]` or `.tt [URL]`',
    howItWorks: 'Fetches the no-watermark version via resilient public endpoints and sends the clean video.',
  },
  {
    name: 'fb',
    aliases: ['fbdl'],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Download Facebook videos in HD when available.',
    usage: '`.fb [Facebook video URL]` or `.fbdl [URL]`',
    howItWorks: 'Resolves the public Facebook video link and returns the highest quality stream the APIs allow.',
  },
  {
    name: 'meme',
    aliases: [],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Fetch a fresh random internet meme.',
    usage: '`.meme`',
    howItWorks: 'Pulls a random meme image from a public keyless meme API and posts it in the chat.',
  },
  {
    name: 'vv',
    aliases: [],
    category: 'Media & Downloads',
    plan: 'premium',
    short: 'Reveal / open a view-once image, video, or voice note so you can keep it.',
    usage: 'Reply to a view-once message with `.vv`',
    howItWorks:
      'View-once media normally disappears after one open. Premium `.vv` intercepts the replied view-once item, re-downloads the media, and re-sends it as a normal (saveable) message so you never lose it.',
    tips: 'Premium only. Must reply directly to the view-once bubble.',
  },
  {
    name: 'send',
    aliases: ['get'],
    category: 'Media & Downloads',
    plan: 'premium',
    short: 'Save or “steal” a replied status, image, video, or any media into the chat.',
    usage: 'Reply to a status update or any media message with `.send` (or `.get`)',
    howItWorks:
      'Downloads the media from the replied message (including status updates you can see) and re-uploads it into the current chat so you own a permanent copy.',
    tips: 'Premium only. Useful for saving disappearing statuses or media you want offline.',
  },
  {
    name: 'pp',
    aliases: [],
    category: 'Media & Downloads',
    plan: 'free',
    short: 'Get someone’s profile picture in full size.',
    usage: '`.pp` (reply to user) · `.pp @mention` · `.pp 234xxxxxxxxxx`',
    howItWorks: 'Looks up the target’s WhatsApp profile photo and sends the high-resolution version if privacy settings allow.',
  },

  // ── Group & Moderation ─────────────────────────────────────
  {
    name: 'link',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Get the current group invite link.',
    usage: '`.link` (bot must be admin in the group)',
    howItWorks: 'Calls WhatsApp groupInviteCode API and returns https://chat.whatsapp.com/… link.',
  },
  {
    name: 'kick',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Remove a member from the group.',
    usage: 'Reply to their message with `.kick` · or `.kick @user` · or `.kick 234…`',
    howItWorks: 'Bot must be admin. Resolves target from reply/mention/number and removes them from the group.',
  },
  {
    name: 'promote',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Make a member a group admin.',
    usage: '`.promote` (reply) / `@mention` / number',
    howItWorks: 'Bot (as admin) promotes the target to admin role.',
  },
  {
    name: 'demote',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Remove admin rights from a member.',
    usage: '`.demote` (reply / mention / number)',
    howItWorks: 'Opposite of promote. Bot must remain admin.',
  },
  {
    name: 'add',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Add a member to the group by phone number.',
    usage: '`.add 2348012345678`',
    howItWorks: 'Invites the number into the group. Number must be on WhatsApp and privacy must allow.',
  },
  {
    name: 'close',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Mute the group so only admins can send messages.',
    usage: '`.close`',
    howItWorks: 'Sets group announce mode = only admins. Useful during announcements or night hours.',
  },
  {
    name: 'open',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Unmute the group so everyone can chat again.',
    usage: '`.open`',
    howItWorks: 'Clears announce-only restriction.',
  },
  {
    name: 'tagall',
    aliases: ['everyone'],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Mention / tag every member in the group.',
    usage: '`.tagall` or `.everyone`  (optional text after the command becomes the caption)',
    howItWorks: 'Builds a message that mentions all participants so their phones notify.',
  },
  {
    name: 'tag',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Silent tag-all (mentions without listing every name in the text).',
    usage: '`.tag [your message]`',
    howItWorks: 'Sends your text while still notifying everyone via hidden mentions — cleaner looking messages.',
  },
  {
    name: 'antilink',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Per-group protection: auto-delete messages that contain links.',
    usage: '`.antilink on` / `.antilink off` (in the group; bot should be admin)',
    howItWorks:
      'When ON, any non-admin message containing a URL is silently deleted. Stops spam, crypto scams, and random group invites.',
  },
  {
    name: 'antimention',
    aliases: ['am'],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Delete status-mention spam (not normal @tags in chat).',
    usage: '`.antimention on|off` or `.am on|off`',
    howItWorks: 'Targets the specific “mentioned in status” notifications that flood groups; leaves normal chat mentions alone.',
  },
  {
    name: 'greet',
    aliases: [],
    category: 'Group & Moderation',
    plan: 'free',
    short: 'Custom welcome message when someone joins the group.',
    usage: '`.greet on` · `.greet off` · `.greet Welcome {user} to our family!`',
    howItWorks: 'Listens for group-participant-update join events and sends your custom (or default) welcome text.',
  },

  // ── AI & Utility ───────────────────────────────────────────
  {
    name: 'ai',
    aliases: ['chat', 'ask'],
    category: 'AI & Utility',
    plan: 'free',
    short: 'Talk to the built-in AI assistant.',
    usage:
      '`.ai [your question]`\nOwner extras:\n`.ai mode off|reply|aggressive`\n`.ai teach [instruction]`\n`.ai persona` · `.ai forget` · `.ai reset`',
    howItWorks:
      'Sends your prompt to the configured AI backend with optional persona memory. Modes: off = command only; reply = answers mentions & swipe-replies; aggressive = answers all DMs + mentions in groups. Owner can teach lasting behaviour with `.ai teach …`.',
  },
  {
    name: 'ping',
    aliases: ['p'],
    category: 'AI & Utility',
    plan: 'free',
    short: 'Check bot latency and online status.',
    usage: '`.ping` or `.p`',
    howItWorks: 'Sends a quick “Pong” and reports round-trip milliseconds plus current mode.',
  },
  {
    name: 'info',
    aliases: ['system'],
    category: 'AI & Utility',
    plan: 'free',
    short: 'System diagnostics — uptime, memory, prefix, mode.',
    usage: '`.info` or `.system`',
    howItWorks: 'Reads process stats and this bot’s settings and prints a clean profile card.',
  },
  {
    name: 'afk',
    aliases: [],
    category: 'AI & Utility',
    plan: 'free',
    short: 'Set Away-From-Keyboard status so the bot can auto-reply when people tag you.',
    usage: '`.afk [reason]` · clear with `.afk` again or by sending a message',
    howItWorks: 'Stores your AFK reason; when someone mentions you the bot can notify them you are away.',
  },
  {
    name: 'help',
    aliases: ['h', 'menu'],
    category: 'AI & Utility',
    plan: 'free',
    short: 'Show the interactive categorized command menu.',
    usage: '`.help` · `.h` · `.menu`',
    howItWorks: 'Renders the full CATALOG of commands with short descriptions, respecting your current prefix and plan.',
  },
  {
    name: 'list',
    aliases: [],
    category: 'AI & Utility',
    plan: 'free',
    short: 'Plain-text full command list (no fancy formatting).',
    usage: '`.list`',
    howItWorks: 'Same catalog, simpler output — good for copying or slow connections.',
  },

  // ── Auto & Presence ────────────────────────────────────────
  {
    name: 'auto',
    aliases: ['presence'],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Toggle typing indicator, recording indicator, or always-online presence.',
    usage: '`.auto typing` · `.auto recording` · `.auto online` (each toggles)',
    howItWorks: 'Controls the presence signals the bot emits so chats look more human or stay “online”.',
  },
  {
    name: 'autostatusview',
    aliases: [],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Automatically view every status update that appears.',
    usage: '`.autostatusview` (toggle on/off)',
    howItWorks:
      'When ON the bot opens every contact’s status as soon as it arrives — even if your phone is offline. Great for never missing a story.',
  },
  {
    name: 'autostatusreact',
    aliases: [],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Auto-react to statuses with a random neutral emoji.',
    usage: '`.autostatusreact` (toggle)',
    howItWorks: 'Pairs with status view: after viewing, bot reacts so the poster sees engagement.',
  },
  {
    name: 'schedulestatus',
    aliases: ['ss'],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Schedule a text, image or video status for a future time.',
    usage: '`.schedulestatus` / `.ss` + follow prompts (time + media/text)',
    howItWorks: 'Queues the status payload and posts it at the chosen time while the session is online.',
  },
  {
    name: 'antidelete',
    aliases: ['ad', 'antidel'],
    category: 'Auto & Presence',
    plan: 'premium',
    short: 'Recover messages that someone deletes (chat-wide or DM-only).',
    usage: '`.antidelete off` · `.antidelete chat` · `.antidelete dm`  (aliases `.ad` / `.antidel`)',
    howItWorks:
      'Bot keeps a short buffer of recent messages. When a delete event arrives it re-sends the original content (text or media) so the deletion is no longer secret. `chat` = groups + DMs; `dm` = private chats only; `off` disables.',
    tips: 'Premium feature. Extremely useful for moderation and accountability.',
  },
  {
    name: 'anticall',
    aliases: ['at'],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Automatically reject incoming calls (all, or from a list).',
    usage: '`.anticall all` · `.anticall list` · `.anticall off`',
    howItWorks: 'Intercepts call offers and declines them according to the rule you set — stops spam callers.',
  },
  {
    name: 'welcome',
    aliases: [],
    category: 'Auto & Presence',
    plan: 'owner',
    short: 'Auto-welcome message when someone starts a new private chat (business style).',
    usage: '`.welcome on|off` or set custom text',
    howItWorks: 'First message from a new DM contact triggers your welcome template — perfect for customer-care numbers.',
  },

  // ── Owner ──────────────────────────────────────────────────
  {
    name: 'setprefix',
    aliases: ['sp', 'prefix'],
    category: 'Owner',
    plan: 'owner',
    short: 'Change the command prefix for this bot only.',
    usage: '`.setprefix !`  or  `.sp /`',
    howItWorks: 'Updates live settings + database so every future command must start with the new character(s).',
  },
  {
    name: 'setmode',
    aliases: ['mode'],
    category: 'Owner',
    plan: 'owner',
    short: 'Switch between public (everyone) and private (owner-only) command access.',
    usage: '`.setmode public` · `.setmode private` · `.mode public`',
    howItWorks:
      'Private = only the paired owner (and listed owners) can run most commands; public = anyone in the chat can. Help/ping stay available in both.',
  },
  {
    name: 'broadcast',
    aliases: ['bc'],
    category: 'Owner',
    plan: 'owner',
    short: 'Send one message to every group the bot is in, with channel follow card.',
    usage: '`.broadcast [your message]` or `.bc [message]`',
    howItWorks: 'Loops all joined groups and posts the text plus an automatic Empire channel follow button/card.',
  },
  {
    name: 'setname',
    aliases: ['sn'],
    category: 'Owner',
    plan: 'owner',
    short: 'Update the bot’s WhatsApp display name.',
    usage: '`.setname New Bot Name`',
    howItWorks: 'Calls the profile-name update API for this multi-device session.',
  },
  {
    name: 'setbio',
    aliases: ['sb'],
    category: 'Owner',
    plan: 'owner',
    short: 'Update the bot’s About / bio text.',
    usage: '`.setbio Available 9am–6pm`',
    howItWorks: 'Writes the new status string to the account profile.',
  },
  {
    name: 'plan',
    aliases: [],
    category: 'Owner',
    plan: 'free',
    short: 'Show current Free / Premium status and expiry.',
    usage: '`.plan`',
    howItWorks: 'Reads bot_registry / settings and prints plan, whitelist flag, and Premium expiry date if any.',
  },
  {
    name: 'upgrade',
    aliases: [],
    category: 'Owner',
    plan: 'free',
    short: 'Get the payment link and list of Premium unlocks.',
    usage: '`.upgrade`',
    howItWorks: 'Returns the official upgrade URL (Paystack/Flutterwave) and the feature list that unlocks after payment.',
  },
  {
    name: 'ghostmode',
    aliases: ['ghost'],
    category: 'Owner',
    plan: 'premium',
    short: 'Silent operation — bot stops sending most confirmation / status feedback messages.',
    usage: '`.ghostmode on` · `.ghostmode off` · `.ghost on|off`',
    howItWorks:
      'When ON, successful command actions happen without the usual “✅ done” style replies. Perfect for stealth moderation or personal bots.',
  },
  {
    name: 'antibot',
    aliases: [],
    category: 'Owner',
    plan: 'premium',
    short: 'Suppress other free Empire bots in the same group (Premium bots are never suppressed).',
    usage: '`.antibot on` · `.antibot off` (group context)',
    howItWorks:
      'Premium owner can signal that free-plan bots should stay quiet in that chat. Other Premium sessions are left alone so paid users never fight each other.',
  },
  {
    name: 'pmode',
    aliases: [],
    category: 'Owner',
    plan: 'premium',
    short: 'Private Status Mode — extra privacy controls around status handling (Premium).',
    usage: '`.pmode on|off`',
    howItWorks: 'Toggles the private-status behaviour layer that ships with Premium.',
  },

  // ── Fun & Faith ────────────────────────────────────────────
  {
    name: 'joke',
    aliases: [],
    category: 'Fun & Faith',
    plan: 'free',
    short: 'Random setup-and-punchline joke.',
    usage: '`.joke`',
    howItWorks: 'Fetches a clean joke from a public API and posts it.',
  },
  {
    name: 'fact',
    aliases: [],
    category: 'Fun & Faith',
    plan: 'free',
    short: 'Random interesting (often useless) fact.',
    usage: '`.fact`',
    howItWorks: 'Pulls a fact string from a public facts endpoint.',
  },
  {
    name: 'bored',
    aliases: ['act'],
    category: 'Fun & Faith',
    plan: 'free',
    short: 'Suggest a random activity when you are bored.',
    usage: '`.bored` or `.act`',
    howItWorks: 'Returns an activity idea from a boredom API.',
  },
  {
    name: 'bible',
    aliases: ['verse'],
    category: 'Fun & Faith',
    plan: 'free',
    short: 'Random or specific Bible verse.',
    usage: '`.bible` · `.bible John 3:16` · `.verse Psalm 23`',
    howItWorks: 'Looks up the reference (or picks random) and returns the verse text.',
  },
  {
    name: 'quran',
    aliases: ['qur', 'ayat'],
    category: 'Fun & Faith',
    plan: 'free',
    short: 'Qur’an ayah — random, by reference, or by surah.',
    usage: '`.quran` · `.quran 2:255` · `.ayat Al-Fatiha`',
    howItWorks: 'Fetches the requested ayah (or random) with clear reference.',
  },

  // ── Business ───────────────────────────────────────────────
  {
    name: 'bank',
    aliases: ['pay'],
    category: 'Business',
    plan: 'free',
    short: 'Show or set the payment account details customers should use.',
    usage: '`.bank` (show) · `.bank [your account text]` (set — owner)',
    howItWorks: 'Stores a free-form bank / payment string per bot so staff can quickly share how to pay you.',
  },
  {
    name: 'header',
    aliases: [],
    category: 'Business',
    plan: 'free',
    short: 'Set company/brand header used on invoices, PDFs and Word docs.',
    usage: '`.header My Company Name · RC123 · Lagos`',
    howItWorks: 'Saved header is prepended to generated business documents for consistent branding.',
  },
  {
    name: 'away',
    aliases: ['busy'],
    category: 'Business',
    plan: 'free',
    short: 'Set an away / busy auto-reply for DMs.',
    usage: '`.away I’m in a meeting, back at 4pm` · `.busy off`',
    howItWorks: 'When set, new private messages receive this auto-reply so customers know you are offline.',
  },
  {
    name: 'invoice',
    aliases: ['inv'],
    category: 'Business',
    plan: 'premium',
    short: 'Generate a styled invoice (text and/or PDF) using your header.',
    usage: '`.invoice` then follow the bot prompts, or pass details in one go',
    howItWorks: 'Builds a professional invoice document from the data you supply and can export as PDF.',
  },
  {
    name: 'receipt',
    aliases: ['rcpt'],
    category: 'Business',
    plan: 'premium',
    short: 'Generate a payment receipt (text / PDF).',
    usage: '`.receipt` or `.rcpt` + amount / customer details',
    howItWorks: 'Creates a clean receipt you can forward to clients as proof of payment.',
  },
  {
    name: 'ocr',
    aliases: [],
    category: 'Business',
    plan: 'premium',
    short: 'Convert image or handwriting into editable text, PDF or Word.',
    usage: 'Reply to an image with `.ocr` (options for text / pdf / doc)',
    howItWorks: 'Runs optical character recognition on the image and returns the extracted text or a formatted document.',
  },
  {
    name: 'pdf',
    aliases: [],
    category: 'Business',
    plan: 'premium',
    short: 'Turn pasted text into a PDF file.',
    usage: '`.pdf [your long text]` or reply to a text message with `.pdf`',
    howItWorks: 'Wraps the supplied text into a downloadable PDF, optionally with your brand header.',
  },
  {
    name: 'doc',
    aliases: ['word', 'docx'],
    category: 'Business',
    plan: 'premium',
    short: 'Turn pasted text into a Microsoft Word (.docx) file.',
    usage: '`.doc [text]` · `.word [text]` · `.docx [text]`',
    howItWorks: 'Generates a real .docx document from the text so clients can open it in Word / Google Docs.',
  },
]

/* ──────────────────────────────────────────────────────────────
   DEPLOY / PAIRING / PLATFORM KNOWLEDGE
   ────────────────────────────────────────────────────────────── */
export const DEPLOY_GUIDE = `
*How to get your own Empire MD bot (under 2 minutes)*

1. Open the Empire MD website (the same site you are chatting on now).
2. Tap *Get Bot* / *Connect* / *Pair*.
3. Enter a unique *bot name* (this becomes your bot’s identity).
4. Enter your WhatsApp number in full international format — *no + and no leading zero*.
   Example for Nigeria: *2348012345678*
5. Choose plan:
   • *Free* — full core features, promo footers on some replies.
   • *Premium (${PREMIUM_PRICE}/${PREMIUM_PERIOD})* — unlocks ghostmode, .vv, .send, anti-delete chat, PDF/receipt/doc, pmode, antibot, no promo footers.
6. You receive a *pairing code* (or QR). On your phone:
   WhatsApp → Linked Devices → Link a Device → Link with phone number instead → enter the code.
7. Once linked, the bot sends you a welcome DM. Type *.help* anywhere to see commands.

*Tips*
• One number = one active session. If you already paired, ask me to check or talk to a human.
• Keep the website tab open until pairing succeeds.
• After Premium payment, plan activates automatically (usually within minutes). You can also type *.upgrade* or *.plan* inside WhatsApp.
• Official channel: ${CHANNEL_URL}
`.trim()

export const PREMIUM_EXPLAIN = `
*Empire MD Premium — ${PREMIUM_PRICE} / ${PREMIUM_PERIOD}*

*What Free already gives you*
Sticker maker, music (.play), YouTube/IG/TikTok/FB downloaders, group moderation (kick, promote, antilink, tagall…), AI chat, auto status view/react, Bible/Quran, jokes, system info, and more.

*What Premium unlocks*
• 👻 *Ghost Mode* — silent command execution, minimal feedback
• 🛡️ *Anti-Delete (chat)* — recover deleted messages in groups & DMs
• 👁️ *.vv* — open and keep view-once photos/videos/voice notes
• 📥 *.send / .get* — save statuses and media permanently
• 📄 *PDF, Receipt, Invoice, OCR, Word docs* — real business documents
• 🔒 *Private Status Mode (pmode)*
• 🤖 *Antibot* — suppress other *free* Empire bots in a group (never touches other Premium bots)
• No promotional footers on replies

*How to pay*
1. Choose Premium during pairing, *or*
2. After free pairing type *.upgrade* on WhatsApp, *or*
3. Use the upgrade / pricing section on this website (Paystack or Flutterwave).

Payment success → plan activates automatically. If it doesn’t within a few minutes, message a human agent with your payment reference.
`.trim()

export const CREATOR_BLURB = `
Empire MD is built and maintained by *${COMPANY}*, led by *${CREATOR_NAME}* (CEO).

He owns the product vision, architecture, multi-bot platform, and growth of Empire MD.

Official CEO page (portfolio & story):
👉 ${CEO_PAGE}

You can also search *“${CREATOR_NAME} Empire Digitals”* or *“${CREATOR_NAME} Empire MD”* to find more about his work.
`.trim()

/* ──────────────────────────────────────────────────────────────
   KEYWORD → INTENT helpers (used by the chat component)
   ────────────────────────────────────────────────────────────── */
export function findCommand(query: string): CommandDoc | null {
  const q = query.toLowerCase().replace(/^\.+/, '').trim()
  if (!q) return null

  // exact name or alias
  for (const c of COMMANDS) {
    if (c.name === q || c.aliases.includes(q)) return c
  }

  // “how does X work”, “explain .play”, “what is antidelete”
  const cleaned = q
    .replace(/\b(how|does|do|what|is|are|explain|tell|me|about|use|using|command|cmd|the|a|an|to|for|of|work|works|working)\b/g, ' ')
    .replace(/[?.!,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (cleaned) {
    for (const c of COMMANDS) {
      if (c.name === cleaned || c.aliases.includes(cleaned)) return c
      if (c.short.toLowerCase().includes(cleaned) && cleaned.length > 3) return c
    }
  }

  // fuzzy-ish: any token matches name
  const tokens = cleaned.split(/\s+/).filter(Boolean)
  for (const t of tokens) {
    for (const c of COMMANDS) {
      if (c.name === t || c.aliases.includes(t)) return c
    }
  }
  return null
}

export function formatCommandReply(c: CommandDoc): string {
  const planBadge =
    c.plan === 'premium' ? '💎 *Premium*' : c.plan === 'owner' ? '👑 *Owner*' : '🆓 *Free*'
  const aliasLine = c.aliases.length ? `\n*Aliases:* ${c.aliases.map((a) => `.${a}`).join(', ')}` : ''
  const tips = c.tips ? `\n\n💡 *Tip:* ${c.tips}` : ''
  return (
    `*${DEFAULT_PREFIX}${c.name}* — ${c.short}\n` +
    `📂 Category: ${c.category}\n` +
    `🎫 Plan: ${planBadge}${aliasLine}\n\n` +
    `*How to use*\n${c.usage}\n\n` +
    `*How it works*\n${c.howItWorks}${tips}`
  )
}

export function listCommandsByCategory(): string {
  const cats = new Map<string, CommandDoc[]>()
  for (const c of COMMANDS) {
    if (!cats.has(c.category)) cats.set(c.category, [])
    cats.get(c.category)!.push(c)
  }
  let out = `*Empire MD — Full Command Catalog*\nDefault prefix: *${DEFAULT_PREFIX}*\n(Premium commands marked 💎)\n\n`
  for (const [cat, list] of cats) {
    out += `*${cat}*\n`
    for (const c of list) {
      const badge = c.plan === 'premium' ? ' 💎' : ''
      out += `• ${DEFAULT_PREFIX}${c.name}${badge} — ${c.short}\n`
    }
    out += '\n'
  }
  out += `_Type the name of any command (e.g. “explain .vv” or “how does antidelete work”) for full usage._`
  return out.trim()
}

export function randomTestimonials(n = 3): string {
  const shuffled = [...TESTIMONIALS].sort(() => Math.random() - 0.5)
  return `*What real users say*\n\n${shuffled.slice(0, n).join('\n\n')}`
}
