// commands/statusScheduler.js
// .schedulestatus (alias .ss) — queue a text/image/video status to auto-post at a set time.
const { downloadContentFromMessage } = require('@whiskeysockets/baileys');
const {
    generateJobId,
    saveMediaBuffer,
    addJob,
    listPendingJobs,
    cancelJob
} = require('../lib/statusScheduler');

async function downloadQuotedMedia(node, mediaType) {
    const stream = await downloadContentFromMessage(node, mediaType);
    let buffer = Buffer.from([]);
    for await (const chunk of stream) buffer = Buffer.concat([buffer, chunk]);
    return buffer;
}

// Matches: "HH:mm rest...", "H:mm AM rest...", "YYYY-MM-DD HH:mm rest..."
const TIME_RE = /^(?:(\d{4}-\d{2}-\d{2})\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?\s*(.*)$/i;

function computeScheduledAt(dateStr, hh, mm, ampm) {
    let hour = parseInt(hh, 10);
    const minute = parseInt(mm, 10);
    if (ampm) {
        const isPm = ampm.toLowerCase() === 'pm';
        if (hour === 12) hour = isPm ? 12 : 0;
        else if (isPm) hour += 12;
    }
    const now = new Date();
    let target;
    if (dateStr) {
        target = new Date(`${dateStr}T00:00:00`);
        target.setHours(hour, minute, 0, 0);
    } else {
        target = new Date();
        target.setHours(hour, minute, 0, 0);
        if (target.getTime() <= now.getTime()) {
            target.setDate(target.getDate() + 1); // time already passed today → schedule for tomorrow
        }
    }
    return target;
}

module.exports = {
    schedulestatus: async ({ sock, chatJid, mek, text, isOwner, quoted }) => {
        if (!isOwner) {
            return sock.sendMessage(chatJid, { text: "❌ Owner only command!" }, { quoted: mek });
        }
        const sessionId = sock.sessionId;
        const arg = (text || "").trim();

        if (!arg) {
            return sock.sendMessage(chatJid, {
                text: `📅 *Schedule Status*
👉 *.schedulestatus HH:mm Your text* — schedule a text status
👉 Reply to an image/video + *.schedulestatus HH:mm caption* — schedule a media status
👉 *.schedulestatus 2026-08-10 09:00 Good morning!* — schedule for a specific date
👉 *.schedulestatus list* — view pending schedules
👉 *.schedulestatus cancel <id>* — cancel a pending schedule

_Times are 24h server time (e.g. 07:30, 21:15, or "9:00 pm"). If the time has already passed today, it auto-schedules for tomorrow. Jobs are saved to disk — they still post even if the bot restarts or is briefly offline right around that time._`
            }, { quoted: mek });
        }

        const lower = arg.toLowerCase();

        if (lower === 'list') {
            const jobs = listPendingJobs(sessionId);
            if (!jobs.length) {
                return sock.sendMessage(chatJid, { text: "📭 No pending scheduled statuses." }, { quoted: mek });
            }
            const lines = jobs.map(j => {
                const when = new Date(j.scheduledAt).toLocaleString();
                const preview = (j.text || '').slice(0, 40);
                return `🆔 ${j.id}\n⏰ ${when}\n📎 ${j.type}${preview ? ` — "${preview}${j.text.length > 40 ? '…' : ''}"` : ''}`;
            });
            return sock.sendMessage(chatJid, { text: `📅 *Pending Scheduled Statuses:*\n\n${lines.join('\n\n')}` }, { quoted: mek });
        }

        if (lower.startsWith('cancel')) {
            const id = arg.split(/\s+/)[1];
            if (!id) return sock.sendMessage(chatJid, { text: "❌ Usage: .schedulestatus cancel <id>" }, { quoted: mek });
            const ok = cancelJob(sessionId, id);
            return sock.sendMessage(chatJid, {
                text: ok ? `✅ Cancelled schedule ${id}.` : `❌ No pending schedule found with id ${id}.`
            }, { quoted: mek });
        }

        const match = arg.match(TIME_RE);
        if (!match) {
            return sock.sendMessage(chatJid, {
                text: "❌ Couldn't parse the time. Use: `.schedulestatus HH:mm Your text` or `.schedulestatus YYYY-MM-DD HH:mm Your text`"
            }, { quoted: mek });
        }

        const [, dateStr, hh, mm, ampm, caption] = match;
        const scheduledAt = computeScheduledAt(dateStr, hh, mm, ampm);
        if (isNaN(scheduledAt.getTime())) {
            return sock.sendMessage(chatJid, { text: "❌ Invalid date/time." }, { quoted: mek });
        }

        const quotedType = quoted?.type; // 'imageMessage' | 'videoMessage' | etc.
        let jobType = 'text';
        let mediaPath = null;
        let jobId = null;

        if (quotedType === 'imageMessage' || quotedType === 'videoMessage') {
            const node = quoted.message[quotedType];
            const mediaKind = quotedType === 'imageMessage' ? 'image' : 'video';
            try {
                const buffer = await downloadQuotedMedia(node, mediaKind);
                const ext = mediaKind === 'image' ? 'jpg' : 'mp4';
                jobId = generateJobId();
                mediaPath = saveMediaBuffer(sessionId, jobId, buffer, ext);
                jobType = mediaKind;
            } catch (e) {
                return sock.sendMessage(chatJid, { text: `❌ Failed to download quoted media: ${e.message}` }, { quoted: mek });
            }
        } else if (!caption || !caption.trim()) {
            return sock.sendMessage(chatJid, {
                text: "❌ A text status needs some text. Reply to an image/video instead if you want a media status."
            }, { quoted: mek });
        }

        const job = addJob(sessionId, {
            id: jobId || undefined,
            type: jobType,
            text: (caption || '').trim(),
            mediaPath,
            scheduledAt: scheduledAt.toISOString()
        });

        await sock.sendMessage(chatJid, {
            text: `✅ *Status scheduled!*\n🆔 ${job.id}\n📎 Type: ${job.type}\n⏰ When: ${scheduledAt.toLocaleString()}${job.text ? `\n📝 "${job.text}"` : ''}`
        }, { quoted: mek });
    },
    ss: async (args) => module.exports.schedulestatus(args)
};
