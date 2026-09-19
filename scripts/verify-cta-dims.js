'use strict';
const fs = require('fs');
const path = require('path');
const P = 'public';
const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
  const p = path.join(d, e.name);
  return e.isDirectory() ? walk(p) : (e.name.endsWith('.html') ? [p] : []);
});
let f = 0; const sums = { old1: 0, old2: 0, old3: 0, new1: 0, new2: 0, new3: 0 };
for (const p of walk(P)) {
  const t = fs.readFileSync(p, 'utf8');
  f++;
  sums.old1 += (t.match(/width="359" height="102"/g) || []).length;
  sums.old2 += (t.match(/width="284" height="169"/g) || []).length;
  sums.old3 += (t.match(/width="676" height="284"/g) || []).length;
  sums.new1 += (t.match(/width="399" height="205"/g) || []).length;
  sums.new2 += (t.match(/width="368" height="214"/g) || []).length;
  sums.new3 += (t.match(/width="349" height="205"/g) || []).length;
}
console.log('files', f, JSON.stringify(sums));