// Shared memory-guard helpers used by server.js and the periodic scrape loop.
// On small Render instances Node's heap limit is auto-tuned close to the
// container ceiling; crossing it aborts the process (exit 134 / SIGABRT),
// which Render reports as a server-failure alert. These helpers run a manual
// GC (when --expose-gc is enabled) and, if memory still can't be reclaimed,
// exit the process cleanly (exit 0) so Render restarts quietly.

const HARD_HEAP_MB = parseInt(process.env.HARD_HEAP_MB || '375', 10);
const SOFT_HEAP_MB = parseInt(process.env.SOFT_HEAP_MB || '310', 10);
// Watchdog interval. Samples heap at a cadence that catches fast mid-job spikes
// (e.g. buildGiantPool / fetchPredictions) which can cross V8's ceiling between
// the per-job checks. Cheap: process.memoryUsage() is a non-blocking syscall.
const WATCHDOG_INTERVAL_MS = parseInt(process.env.WATCHDOG_INTERVAL_MS || '500', 10);

function heapMB() {
  try {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  } catch (e) {
    return 0;
  }
}

function reclaimMemory() {
  if (typeof global.gc === 'function') {
    try {
      global.gc();
    } catch (e) {
      /* ignore */
    }
  }
}

function forceRestartIfMemoryCritical() {
  const memMB = heapMB();
  if (memMB >= HARD_HEAP_MB) {
    console.error('[memory] HARD limit reached (' + memMB + 'MB >= ' + HARD_HEAP_MB + 'MB). Forcing clean restart to avoid OOM abort (exit 134).');
    reclaimMemory();
    const memAfter = heapMB();
    if (memAfter >= HARD_HEAP_MB) {
      process.exit(0);
    }
    console.log('[memory] Recovered after GC to ' + memAfter + 'MB; continuing.');
  } else if (memMB >= SOFT_HEAP_MB) {
    reclaimMemory();
  }
}

// Background watchdog: guarantees the process exits cleanly (0) before V8's
// auto-tuned heap ceiling triggers an unrecoverable OOM abort (exit 134).
// Started once after app boot; safe to no-op if already running.
let watchdogTimer = null;
function startMemoryWatchdog() {
  if (watchdogTimer !== null) return;
  watchdogTimer = setInterval(function () {
    const memMB = heapMB();
    if (memMB >= HARD_HEAP_MB) {
      reclaimMemory();
      const memAfter = heapMB();
      if (memAfter >= HARD_HEAP_MB) {
        console.error('[memory-watchdog] Heap ' + memAfter + 'MB >= hard ' + HARD_HEAP_MB + 'MB after GC. Clean exit to avoid OOM abort.');
        process.exit(0);
      }
      console.log('[memory-watchdog] GC recovered to ' + memAfter + 'MB; continuing.');
    }
  }, WATCHDOG_INTERVAL_MS);
  if (typeof watchdogTimer.unref === 'function') watchdogTimer.unref();
}

module.exports = {
  HARD_HEAP_MB,
  SOFT_HEAP_MB,
  heapMB,
  reclaimMemory,
  forceRestartIfMemoryCritical,
  startMemoryWatchdog
};
