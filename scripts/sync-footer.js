'use strict';

const fs = require('fs');
const path = require('path');
const { applyFooterToHtml } = require('../src/templates/layout');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
let updated = 0;
let scanned = 0;

function syncDirectory(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      syncDirectory(file);
      continue;
    }
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.html')) continue;

    scanned++;
    const current = fs.readFileSync(file, 'utf8');
    const next = applyFooterToHtml(current);
    if (next !== current) {
      fs.writeFileSync(file, next);
      updated++;
    }
  }
}

syncDirectory(PUBLIC_DIR);
console.log('Synchronized homepage footer across ' + scanned + ' HTML pages (' + updated + ' updated).');
