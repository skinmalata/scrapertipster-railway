// Shared memory-guard helpers used by server.js and the periodic scrape loop.
// On small Render instances Node's heap limit is auto-tuned close to the
// container ceiling; crossing it aborts the process (exit 134 / SIGABRT),
// which Render reports as a server-failure alert. These helpers run a manual
// GC (when --expose-gc is enabled) and, if memory still can't be reclaimed,
// exit the process cleanly (exit 0) so Render restarts quietly.

const HARD_HEAP_MB = parseInt(process.env.HARD_HEAP_MB || '375', 10);
const SOFT_HEAP_MB = parseInt(process.env.SOFT_HEAP_MB || '310', 10);

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

module.exports = {
  HARD_HEAP_MB,
  SOFT_HEAP_MB,
  heapMB,
  reclaimMemory,
  forceRestartIfMemoryCritical
};
