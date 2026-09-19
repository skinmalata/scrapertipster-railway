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
let files = 0, hits = 0;
for (const file of walk(PUBLIC)) {
  let t = fs.readFileSync(file, 'utf8');
  const n = (t.match(/\/app\.css(?:\?v=\d+)?/g) || []).length;
  if (n) {
    t = t.replace(/\/app\.css(?:\?v=\d+)?/g, '/app.css?v=5');
    fs.writeFileSync(file, t);
    files++; hits += n;
  }
}
console.log('files changed:', files, 'replacements:', hits);