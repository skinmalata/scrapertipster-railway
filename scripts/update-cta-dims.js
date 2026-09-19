'use strict';
const fs = require('fs');
const path = require('path');
const PUBLIC = 'C:\\Users\\Toks\\Documents\\Apps\\Deployed\\winfulltime\\public';
const RULES = [
  ['width="359" height="102"', 'width="399" height="205"'],
  ['width="284" height="169"', 'width="368" height="214"'],
  ['width="676" height="284"', 'width="349" height="205"']
];
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
  let n = 0;
  for (const [a, b] of RULES) {
    const c = (t.match(new RegExp(a.replace(/"/g, '\\"').replace(/ /g, '\\s*'), 'g')) || []).length;
    t = t.split(a).join(b);
    n += c;
  }
  if (n) { fs.writeFileSync(file, t); files++; hits += n; }
}
console.log('files:', files, 'replacements:', hits);