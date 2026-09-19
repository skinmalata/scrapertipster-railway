'use strict';
const fs = require('fs');
const path = require('path');
const PUBLIC = 'C:\\Users\\Toks\\Documents\\Apps\\Deployed\\winfulltime\\public';
function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out = out.concat(walk(p));
    else if (e.name.endsWith('.html')) out.push(p);
  }
  return out;
}
const pat = /[^"'\s>]*app\.css[^"'\s>]*/g;
const counts = new Map();
for (const file of walk(PUBLIC)) {
  const t = fs.readFileSync(file, 'utf8');
  for (const m of t.matchAll(pat)) {
    counts.set(m[0], (counts.get(m[0]) || 0) + 1);
  }
}
console.log('total occurrences:', [...counts.values()].reduce((a, b) => a + b, 0));
for (const [k, v] of [...counts.entries()].sort((a, b) => b[1] - a[1])) console.log(`${v}\t${k}`);