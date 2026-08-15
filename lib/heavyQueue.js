// Empire MD — Heavy-command queue
// Each bot session is its own child process, so this queue is naturally
// scoped per-bot. Premium always runs immediately; Free-tier heavy
// commands (media conversions, downloads, etc.) queue behind one another
// so a single free bot can't hammer the server with parallel heavy jobs.
// Premium never waits in this queue at all.

const HEAVY_COMMANDS = new Set([
  'sticker', 's',
  'ytmp4', 'video',
  'tt', 'tiktok',
  'fb', 'fbdl',
  'ytmp3', 'song',
  'toimg', 'tovid', 'tomp3',
  'remini', 'enhance',
  'compress'
]);

let queue = Promise.resolve();
let queueLength = 0;

/**
 * Run `fn` through the free-tier queue. Premium callers should never call
 * this — call `fn()` directly instead so they skip the queue entirely.
 * Returns { position } synchronously-ish info via the onQueued callback so
 * the caller can message the user their queue position before it starts.
 */
function runQueued(fn, onQueued) {
  queueLength += 1;
  const position = queueLength;
  if (onQueued) {
    try { onQueued(position); } catch (_) {}
  }
  const run = () => fn().finally(() => { queueLength = Math.max(0, queueLength - 1); });
  queue = queue.then(run, run); // keep the chain alive even if one job throws
  return queue;
}

function isHeavyCommand(cmd) {
  return HEAVY_COMMANDS.has(cmd);
}

module.exports = { runQueued, isHeavyCommand, HEAVY_COMMANDS };
