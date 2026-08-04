'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const CREDENTIALS_FILE = path.join(__dirname, '..', 'google-credentials.json');

function collectProgrammaticUrls() {
  const urls = [];
  const BASE_URL = 'https://winfulltime.com';

  // 1. League Pages
  const leagueDir = path.join(ROOT, 'predictions', 'league');
  if (fs.existsSync(leagueDir)) {
    fs.readdirSync(leagueDir).forEach(slug => {
      if (/^[\w-]+$/.test(slug)) urls.push(`${BASE_URL}/predictions/league/${slug}/`);
    });
  }

  // 2. H2H Pages
  const h2hDir = path.join(ROOT, 'h2h');
  if (fs.existsSync(h2hDir)) {
    fs.readdirSync(h2hDir).forEach(slug => {
      if (/^[\w-]+$/.test(slug)) urls.push(`${BASE_URL}/h2h/${slug}/`);
    });
  }

  // 3. Team Pages
  const teamDir = path.join(ROOT, 'teams');
  if (fs.existsSync(teamDir)) {
    fs.readdirSync(teamDir).forEach(slug => {
      if (/^[\w-]+$/.test(slug)) urls.push(`${BASE_URL}/teams/${slug}/`);
    });
  }

  // 4. Date Archives
  const dateDir = path.join(ROOT, 'predictions', 'date');
  if (fs.existsSync(dateDir)) {
    fs.readdirSync(dateDir).forEach(dateStr => {
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) urls.push(`${BASE_URL}/predictions/date/${dateStr}/`);
    });
  }

  return urls;
}

async function main() {
  const urls = collectProgrammaticUrls();
  console.log(`[google-indexing] Found ${urls.length} programmatic URLs ready for Google Indexing API submission.`);

  let credentials = null;

  if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
    try {
      const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY.trim();
      credentials = raw.startsWith('{') ? JSON.parse(raw) : JSON.parse(Buffer.from(raw, 'base64').toString('utf8'));
    } catch (e) {
      console.warn('[google-indexing] Failed to parse GOOGLE_SERVICE_ACCOUNT_KEY env var:', e.message);
    }
  } else if (fs.existsSync(CREDENTIALS_FILE)) {
    try {
      credentials = JSON.parse(fs.readFileSync(CREDENTIALS_FILE, 'utf8'));
    } catch (e) {
      console.warn('[google-indexing] Failed to parse google-credentials.json:', e.message);
    }
  }

  if (!credentials || !credentials.client_email || !credentials.private_key) {
    console.log('\n----------------------------------------------------------------------');
    console.log('[google-indexing] SETUP GUIDE: Google Indexing API Credentials Pending');
    console.log('To enable automated push to Google Search Console API:');
    console.log('1. Go to Google Cloud Console (https://console.cloud.google.com/).');
    console.log('2. Create a Service Account and download its JSON Key file.');
    console.log('3. Enable Google Indexing API in Google Cloud project settings.');
    console.log('4. Add the Service Account email to your Google Search Console as Owner.');
    console.log('5. Save key file as google-credentials.json in root or set GOOGLE_SERVICE_ACCOUNT_KEY.');
    console.log('----------------------------------------------------------------------\n');
    return;
  }

  console.log(`[google-indexing] Authenticating Service Account: ${credentials.client_email}...`);
  // If googleauth library or axios is present, batch publish URL_UPDATED requests
  try {
    const { google } = require('googleapis');
    const auth = new google.auth.JWT(
      credentials.client_email,
      null,
      credentials.private_key,
      ['https://www.googleapis.com/auth/indexing']
    );

    await auth.authorize();
    console.log('[google-indexing] OAuth2 authentication successful!');

    let submitted = 0;
    const sampleUrls = urls.slice(0, 100); // Process batch

    for (const url of sampleUrls) {
      try {
        await google.indexing({ version: 'v3', auth }).urlNotifications.publish({
          requestBody: {
            url: url,
            type: 'URL_UPDATED'
          }
        });
        submitted++;
      } catch (err) {
        console.warn(`[google-indexing] Failed to publish ${url}:`, err.message);
      }
    }

    console.log(`[google-indexing] Successfully published ${submitted}/${sampleUrls.length} URLs to Google Indexing API.`);
  } catch (e) {
    console.warn('[google-indexing] Indexing API execution note (googleapis package required for live API call):', e.message);
  }
}

if (require.main === module) {
  main().catch(err => console.error('[google-indexing] Error:', err));
}

module.exports = { main };
