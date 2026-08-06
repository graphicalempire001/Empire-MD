// lib/statusScheduler.js
// Lets each bot session queue text/image/video WhatsApp Status posts for a future
// time. Jobs are persisted as plain JSON files on disk (not in-memory), so they
// survive worker crashes/restarts/VPS reboots — the whole point being "post it
// even if the bot was offline at the exact scheduled time." On (re)connect and
// then every 60s, each worker checks its own session's due jobs and posts them,
// so a missed window is caught up on the next check rather than silently dropped.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'scheduled_status');
const MEDIA_ROOT = path.join(ROOT, 'media');
const MAX_ATTEMPTS = 3;
const CHECK_INTERVAL_MS = 60 * 1000; // 60s

function ensureDirs(sessionId) {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.mkdirSync(path.join(MEDIA_ROOT, sessionId), { recursive: true });
}

function jobsFilePath(sessionId) {
    return path.join(ROOT, `${sessionId}.json`);
}

function loadJobs(sessionId) {
    ensureDirs(sessionId);
    const fp = jobsFilePath(sessionId);
    if (!fs.existsSync(fp)) return [];
    try {
        const raw = fs.readFileSync(fp, 'utf8');
        return raw ? JSON.parse(raw) : [];
    } catch (e) {
        console.error(`⚠️ Corrupt schedule file for ${sessionId}, resetting:`, e.message);
        return [];
    }
}

function saveJobs(sessionId, jobs) {
    ensureDirs(sessionId);
    fs.writeFileSync(jobsFilePath(sessionId), JSON.stringify(jobs, null, 2));
}

function generateJobId() {
    return `job_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Downloads/quoted media is saved to disk immediately when the command runs,
// so it's available later even if the original WhatsApp message is deleted
// or the process restarts before the scheduled time arrives.
function saveMediaBuffer(sessionId, jobId, buffer, ext) {
    ensureDirs(sessionId);
    const filePath = path.join(MEDIA_ROOT, sessionId, `${jobId}.${ext}`);
    fs.writeFileSync(filePath, buffer);
    return filePath;
}

function addJob(sessionId, job) {
    const jobs = loadJobs(sessionId);
    const full = {
        id: job.id || generateJobId(),
        type: job.type,                 // 'text' | 'image' | 'video'
        text: job.text || '',           // caption (media) or full text (text status)
        mediaPath: job.mediaPath || null,
        scheduledAt: job.scheduledAt,   // ISO string
        posted: false,
        attempts: 0,
        createdAt: new Date().toISOString()
    };
    jobs.push(full);
    saveJobs(sessionId, jobs);
    return full;
}

function listPendingJobs(sessionId) {
    return loadJobs(sessionId)
        .filter(j => !j.posted)
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
}

function cancelJob(sessionId, jobId) {
    const jobs = loadJobs(sessionId);
    const idx = jobs.findIndex(j => j.id === jobId && !j.posted);
    if (idx === -1) return false;
    const [removed] = jobs.splice(idx, 1);
    if (removed.mediaPath) {
        try { fs.rmSync(removed.mediaPath, { force: true }); } catch (_) {}
    }
    saveJobs(sessionId, jobs);
    return true;
}

function getDueJobs(sessionId) {
    const now = Date.now();
    return loadJobs(sessionId).filter(j => !j.posted && new Date(j.scheduledAt).getTime() <= now);
}

function markPosted(sessionId, jobId) {
    const jobs = loadJobs(sessionId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    job.posted = true;
    job.postedAt = new Date().toISOString();
    saveJobs(sessionId, jobs);
    // Free the disk space — media is no longer needed after posting
    if (job.mediaPath) {
        try { fs.rmSync(job.mediaPath, { force: true }); } catch (_) {}
    }
}

function bumpAttemptsOrGiveUp(sessionId, jobId, errMsg) {
    const jobs = loadJobs(sessionId);
    const job = jobs.find(j => j.id === jobId);
    if (!job) return;
    job.attempts = (job.attempts || 0) + 1;
    job.lastError = errMsg;
    if (job.attempts >= MAX_ATTEMPTS) {
        console.error(`🛑 Giving up on scheduled status ${jobId} for ${sessionId} after ${job.attempts} failed attempts: ${errMsg}`);
        job.posted = true; // stop retrying, but flag it as failed rather than successfully posted
        job.failed = true;
        if (job.mediaPath) {
            try { fs.rmSync(job.mediaPath, { force: true }); } catch (_) {}
        }
    }
    saveJobs(sessionId, jobs);
}

// Builds the actual sock.sendMessage(...) payload for a job
function buildStatusPayload(job) {
    if (job.type === 'text') {
        return { text: job.text || '' };
    }
    const buffer = fs.readFileSync(job.mediaPath);
    if (job.type === 'image') {
        return { image: buffer, caption: job.text || undefined };
    }
    if (job.type === 'video') {
        return { video: buffer, caption: job.text || undefined };
    }
    throw new Error(`Unknown job type: ${job.type}`);
}

async function postDueJobs(sock) {
    const sessionId = sock.sessionId;
    if (!sessionId) return;

    const due = getDueJobs(sessionId);
    if (!due.length) return;

    const ownerJid = sock.ownerNumber?.[0]
        ? `${sock.ownerNumber[0]}@s.whatsapp.net`
        : null;

    // Some Baileys versions (v7 included) require an explicit statusJidList
    // to actually deliver a 'status@broadcast' post — without it the call can
    // succeed with no thrown error but reach nobody. We use whatever contacts
    // this session has seen so far (see botWorker.js sock._knownContacts).
    const knownContacts = sock._knownContacts ? [...sock._knownContacts] : [];

    for (const job of due) {
        try {
            const payload = buildStatusPayload(job);
            const options = knownContacts.length ? { statusJidList: knownContacts } : undefined;
            await sock.sendMessage('status@broadcast', payload, options);
            markPosted(sessionId, job.id);
            console.log(`✅ Posted scheduled status ${job.id} (${job.type}) for ${sessionId}`);
            if (ownerJid) {
                await sock.sendMessage(ownerJid, {
                    text: `✅ Scheduled status posted (${job.type})${job.text ? `: "${job.text.slice(0, 60)}"` : ''}${knownContacts.length ? `\n📇 Sent to ${knownContacts.length} known contact(s)` : '\n⚠️ No known contacts yet this session — status may not have reached anyone. Message the bot from your main number first so it learns your JID.'}`
                }).catch(() => {});
            }
        } catch (e) {
            console.error(`❌ Failed to post scheduled status ${job.id} for ${sessionId}:`, e.message);
            bumpAttemptsOrGiveUp(sessionId, job.id, e.message);
            if (ownerJid) {
                await sock.sendMessage(ownerJid, {
                    text: `❌ Scheduled status failed to post (${job.type}): ${e.message}`
                }).catch(() => {});
            }
        }
    }
}

// Call once per live socket (e.g. inside connection === 'open'). Safe to call
// again on reconnect — each fresh sock gets its own interval, and the caller
// is expected to clearInterval(sock._statusSchedulerInterval) on 'close'.
function startStatusScheduler(sock) {
    if (sock._statusSchedulerStarted) return;
    sock._statusSchedulerStarted = true;

    // Catch up immediately on connect (covers "was offline at the exact time")
    postDueJobs(sock).catch(e => console.error('statusScheduler initial check failed:', e.message));

    sock._statusSchedulerInterval = setInterval(() => {
        postDueJobs(sock).catch(e => console.error('statusScheduler interval check failed:', e.message));
    }, CHECK_INTERVAL_MS);
}

function stopStatusScheduler(sock) {
    if (sock._statusSchedulerInterval) {
        clearInterval(sock._statusSchedulerInterval);
        sock._statusSchedulerInterval = null;
    }
    sock._statusSchedulerStarted = false;
}

module.exports = {
    generateJobId,
    saveMediaBuffer,
    addJob,
    listPendingJobs,
    cancelJob,
    getDueJobs,
    markPosted,
    startStatusScheduler,
    stopStatusScheduler
};
