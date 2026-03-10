const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(process.cwd(), 'debug.log');

function debugLog(...args) {
  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
  console.log(msg);
  try {
    fs.appendFileSync(LOG_FILE, new Date().toISOString() + ' ' + msg + '\n');
  } catch (err) {
    console.error('Failed to write to log file:', err);
  }
}

module.exports = { debugLog };
