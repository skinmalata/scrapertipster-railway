#!/usr/bin/env node
// Publishes today's H2H pool to public/data/author-picks.json so that
// author-picks.html can fall back to a same-origin copy when the Render API is
// unreachable. The API is a separate host: when it wedges, the pool -- which is
// built from sources this same deploy just refreshed -- is still perfectly
// servable from GitHub Pages. Build happens here rather than on a client
// request so a wedged Render never blocks delivery of the picks themselves.
const fs = require('fs');
const path = require('path');
const { buildGiantPool } = require('../src/services/authorPicks');

const OUT = path.join(__dirname, '..', 'public', 'data', 'author-picks.json');

async function main() {
  const started = Date.now();
  const pool = await buildGiantPool();

  if (!pool || !Array.isArray(pool.matches) || !pool.matches.length) {
    throw new Error('buildGiantPool returned no matches');
  }

  // Published as the API would return it (matches/generatedAt/stale/poolDate)
  // so the client renders it through the same code path. The client knows a
  // response came from this file, so no extra flag is needed here.
  //
  // This file is served to everyone from GitHub Pages, so it must NOT carry the
  // full Pro pool: free visitors get the same mid-list sample the API sends
  // (a handful of picks that skips the top-confidence ones).
  var matches = pool.matches || [];
  var FREE_SAMPLE = 3;
  if (matches.length > FREE_SAMPLE) {
    var start = Math.floor((matches.length - FREE_SAMPLE) / 2);
    matches = matches.slice(start, start + FREE_SAMPLE);
  }
  const payload = Object.assign({}, pool, {
    matches: matches,
    generatedAt: pool.generatedAt || new Date().toISOString(),
    publishedAt: new Date().toISOString()
  });

  fs.mkdirSync(path.dirname(OUT), { recursive: true });

  // Write-then-rename: a failure mid-write must not leave a truncated file in
  // the deploy artifact, which would replace a good seed with a broken one.
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(payload));
  fs.renameSync(tmp, OUT);

  const bytes = fs.statSync(OUT).size;
  console.log('[prewarm] published ' + matches.length + ' of ' + pool.matches.length + ' picks -> ' +
    path.relative(process.cwd(), OUT) + ' (' + Math.round(bytes / 1024) +
    ' KB, ' + (Date.now() - started) + 'ms)');
}

main().catch(function (e) {
  console.error('[prewarm] FAILED: ' + (e && e.message));
  process.exit(1);
});
