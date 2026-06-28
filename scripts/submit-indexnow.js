const fs = require('fs');
const path = require('path');

const SITE_HOST = 'winfulltime.com';
const API_KEY = 'ae5787de-64f9-429c-9e87-239b044d0aef';
const INDEXNOW_URL = 'https://api.indexnow.org/indexnow';

function getUrls() {
  const urls = [
    `https://${SITE_HOST}/`,
    `https://${SITE_HOST}/analysis.html`,
  ];

  const articlesPath = path.join(__dirname, '..', 'articles-manifest.json');
  if (fs.existsSync(articlesPath)) {
    const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
    for (const article of articles) {
      if (article.published) {
        urls.push(`https://${SITE_HOST}/blog/${article.slug}`);
      }
    }
  }

  return urls;
}

async function submit() {
  const urls = getUrls();
  console.log(`Submitting ${urls.length} URLs to IndexNow...`);

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
