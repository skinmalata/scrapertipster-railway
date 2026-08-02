const { execFileSync } = require('child_process');

const SITE_HOST = 'winfulltime.com';
const API_KEY = 'ae5787de-64f9-429c-9e87-239b044d0aef';
const INDEXNOW_URL = 'https://api.indexnow.org/indexnow';

function getChangedUrls() {
  const before = process.env.INDEXNOW_BEFORE_SHA;
  const after = process.env.INDEXNOW_AFTER_SHA || 'HEAD';
  if (!before || /^0+$/.test(before)) {
    console.log('IndexNow: no previous commit SHA (first push) — skipping URL submission.');
    return [];
  }

  let changedFiles;
  try {
    changedFiles = execFileSync('git', ['diff', '--name-only', before, after, '--', 'public'], { encoding: 'utf8' })
      .split(/\r?\n/)
      .filter(Boolean);
  } catch (err) {
    console.warn(`IndexNow: could not diff ${before}..${after} (${err.message}). Skipping URL submission.`);
    return [];
  }

  const urls = changedFiles
    .filter((file) => file.endsWith('.html'))
    .map((file) => file.slice('public'.length))
    .map((urlPath) => {
      if (urlPath === '/index.html') return `https://${SITE_HOST}/`;
      return `https://${SITE_HOST}${urlPath.replace(/\/index\.html$/, '/')}`;
    });

  return [...new Set(urls)];
}

async function submit() {
  const urls = getChangedUrls();
  if (urls.length === 0) {
    console.log('IndexNow: no changed HTML pages to submit.');
    return;
  }

  console.log(`Submitting ${urls.length} changed URL(s) to IndexNow...`);

  const payload = {
    host: SITE_HOST,
    key: API_KEY,
    keyLocation: `https://${SITE_HOST}/${API_KEY}.txt`,
    urlList: urls,
  };

  try {
    const response = await fetch(INDEXNOW_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log(`IndexNow: Success (${response.status})`);
    } else {
      const body = await response.text();
      console.error(`IndexNow: Failed (${response.status}) - ${body}`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`IndexNow: Error - ${err.message}`);
    process.exit(1);
  }
}

submit();
