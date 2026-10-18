const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-core');
const { executablePath } = require('../src/config/puppeteer');

const CACHE_FILE = path.join(process.cwd(), 'data', 'player-shots', 'epl.json');
const STATIC_FILE = path.join(process.cwd(), 'public', 'data', 'player-shots.json');
const CACHE_DIR = path.dirname(CACHE_FILE);

// Headless=false is required to pass the Cloudflare "Just a moment" JS challenge on
// footystats.org. The local residential IP + real Chrome fingerprint is enough.
async function scrapeFootystats(url, leagueLabel) {
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });
  const page = await browser.newPage();
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
    await new Promise(r => setTimeout(r, 12000));

    const players = await page.evaluate(() => {
      const out = [];
      const tables = Array.from(document.querySelectorAll('table.full-league-table'));
      // Find the players table by header "Shots" and "Player"
      for (const t of tables) {
        const ths = Array.from(t.querySelectorAll('thead th')).map(x => x.textContent.trim());
        if (!ths.includes('Shots') || !ths.includes('MP') || !ths.includes('Player')) continue;
        const rows = Array.from(t.querySelectorAll('tbody tr'));
        for (const row of rows) {
          const cells = Array.from(row.querySelectorAll('td'));
          if (cells.length < 7) continue;
          const name = cells[1].textContent.trim().replace(/\s+/g, ' ');
          const shots = parseInt(cells[2].textContent.trim(), 10) || 0;
          const mp = parseInt(cells[3].textContent.trim(), 10) || 0;
          const goals = parseInt(cells[4].textContent.trim(), 10) || 0;
          const onTarget = parseInt(cells[5].textContent.trim(), 10) || 0;
          const offTarget = parseInt(cells[6].textContent.trim(), 10) || 0;
          const conv = parseFloat(cells[7].textContent.replace('%', '').trim()) || 0;
          if (!name) continue;
          out.push({ name, shots, mp, goals, onTarget, offTarget, conv });
        }
      }
      return out;
    });

    return players;
  } finally {
    await browser.close();
  }
}

async function main() {
  const url = 'https://footystats.org/england/premier-league/shots';
  console.log('[Player Shots] Scraping FootyStats EPL shots...');
  const players = await scrapeFootystats(url, 'Premier League');
  console.log(`[Player Shots] Parsed ${players.length} players`);

  if (players.length === 0) {
    console.log('[Player Shots] No players parsed, keeping previous cache');
    process.exit(0);
  }

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const result = {
    success: true,
    date: new Date().toISOString().split('T')[0],
    league: 'English Premier League',
    source: 'footystats.org',
    updatedAt: new Date().toISOString(),
    totalPlayers: players.length,
    players
  };
  fs.writeFileSync(CACHE_FILE, JSON.stringify(result, null, 2));
  console.log(`[Player Shots] Saved ${players.length} players to ${CACHE_FILE}`);
  // Mirror to public/data so the static host (GitHub Pages) can serve the tab
  fs.mkdirSync(path.dirname(STATIC_FILE), { recursive: true });
  fs.writeFileSync(STATIC_FILE, JSON.stringify(result, null, 2));
  console.log(`[Player Shots] Mirrored to ${STATIC_FILE}`);
}

main().catch(err => {
  console.error('[Player Shots] Scrape failed:', err.message);
  // Non-zero exit so refresh-local-caches.ps1 flags it
  process.exit(1);
});
