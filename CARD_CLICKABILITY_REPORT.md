# Why Some Homepage Prediction Cards Are Not Clickable

Status: Investigation complete (live data verified 2026-08-20). No code changed.

## How card links work today

1. `public/index.html` fetches `/data/predictions.json` **and** `/data/analysis-links.json`
   in parallel (`index.html:1244-1247`).
2. Each card renders normally as a `<div class="match-card">`. Immediately before
   insertion, `renderMatches` computes:

   ```js
   const analysisKey = (home + '|' + away).toLowerCase();
   const analysisHref = analysisLinks[analysisKey];
   if (!analysisHref) return cardHtml;              // plain div, NOT clickable
   return `<a href="${analysisHref}" class="match-card-link" ...>${cardHtml}</a>`;
   ```

   (`index.html:1172-1178`). CSS sets `cursor: default` on `.match-card`
   (`public/app.css` ~570) but there is no `.match-card-link` style, so wrapped
   cards inherit the default cursor — which is why clickable vs. not-clickable
   cards look identical.

3. `analysis-links.json` is written by `scripts/build-analysis.js` →
   `writePrerenderedPages` (`build-analysis.js:652-685`), which keys it by the
   **raw, lowercased** `home|away` names of whichever **covered category first**
   listed the fixture:

   ```js
   const key = m.home.toLowerCase() + '|' + m.away.toLowerCase();
   links[key] = '/analysis/' + date + '/' + slug + '/';
   ```
   (`build-analysis.js:657-669`).

4. `collectMatchups` (`build-analysis.js:800-835`) only reads these categories:

   ```js
   predictions.matches,
   predictions.over15Matches,
   predictions.over25Matches,
   predictions.bttsMatches,
   predictions.bttsNoMatches
   ```

   It dedupes fixtures by the `slugifyTeam(home)|slugifyTeam(away)` pair, but the
   **key written to the links file uses the raw names, not the slugified names.**

## Live coverage verified against winfulltime.com (2026-08-20)

`analysis-links.json` has 1,625 keys. Today's homepage categories:

| Category             | Shown | Linkable | Notes |
|----------------------|------:|---------:|-------|
| 1x2 (matches)        |    33 |       30 | 3 missing (see below) |
| Over 1.5             |    16 |       14 | 2 missing (1 is a name mismatch) |
| Over 2.5             |     4 |        1 | 3 missing |
| BTTS                |     5 |        4 | 1 is a name mismatch |
| Corners              |    17 |        1 | 16 missing — category never analyzed |
| Cards                |    22 |        0 | category never analyzed |
| Team to score 2+      |    15 |        0 | category never analyzed |
| Streaks (win/lose/draw) | 100 |      0 | category never analyzed |

## Root causes (three distinct failure modes)

### 1. Categories that are never analyzed
`collectMatchups` reads only 5 of the ~9 prediction categories. Cards, corners,
team2plus, and streak matches never appear in `analysis-links.json` — except when
the same fixture also appears in a covered category under the exact same name
(the single clickable corners card, Twente–Qarabag, is such a case).

Additionally, `teamToScore2PlusMatches` and the streak matches use a
**single-team `match` string with no ` - ` / ` vs ` separator**, so
`splitMatch` (`build-analysis.js:108-114`) returns `[]` and a `home|away` key
can never be constructed for them, even in principle.

### 2. Fixtures that failed or were skipped by the analyzer
`analysis.json` (live) contains **no entry at all** for these today (scraper
budget cap / FotMob fallback gap / date-window mismatch):
- Besiktas – Kauno Zalgiris (1x2)
- Hajduk – Rakow Crestochowa (1x2)
- Tromso – Brighton (1x2)
- Inter Turku – FC Copenhagen (Over 2.5)
- FCSB – Csikszereda (Over 2.5)
- Vendsyssel FF – Hillerod Fodbold (Over 2.5)
- CS Comunal Selimbar – FC Botosani (Over 1.5)

### 3. Name-variant / home-away order mismatch
The key is written from the **first covered category's raw names**. Other
categories may spell the same fixture differently, and the exact-match lookup
then misses even though a valid analysis page exists:

| Displayed card                        | Lookup key                    | Analyzed key (in links file) |
|---------------------------------------|-------------------------------|------------------------------|
| FC Bunyodkor – Kokand 1912 (BTTS)     | `fc bunyodkor\|kokand 1912`   | `bunyodkor\|kokand 1912` |
| Lech Poznan – FC Thun (Over 1.5)      | `lech poznan\|fc thun`        | `lech poznan\|thun` |
| Esbjerg vs Vejle Boldklub (Corners)   | `esbjerg\|vejle boldklub`     | `vejle\|esbjerg` (reversed order + alias) |

The codebase already has the tools to fix this class of miss —
`normalizeTeam` (`build-analysis.js:61-71`, strips `fc/afc/united` prefixes,
handles aliases) and `slugifyTeam` (`lib/layout.js:13`) — but they are used for
dedup and page slugs only, **not** for the link key or the card lookup path.

## Recommendation (permanent fixes, in priority order)

- **A. Always-clickable card fallback (client, smallest change).** In the card
  renderer, when the exact key misses: retry via `normalizeTeam`/`slugifyTeam`
  alias keys, then reversed-order; if still missing, wrap the card in a
  deterministic fallback anchor (e.g. `/analysis.html?q=home+away` or the
  relevant team page) so no card ever renders dead.

- **D. Canonical slug-key map (best long-term).** Emit a second map
  (`analysis-links-by-slug.json`) keyed by `slugifyTeam(home)|slugifyTeam(away)`
  alongside the raw-name map, and have all renderers (index.html + static
  category pages) look up slug-key first, raw-key second. Eliminates the
  FC/order/alias class of misses entirely.

- **B. Cover the missing categories.** Extend `collectMatchups` to also read
  `teamToScore2PlusMatches` and the streak matches (pair the single team with
  its opponent before keying) and add corners/cards to the covered set.

- **C. Expand scraper coverage.** Raise/retry the analyzer budget so the ~10
  genuinely-skipped fixtures per day get analyzed — reduces how often the
  fallback in A is exercised.

- **Bonus UX polish.** Add `.match-card-link` CSS (e.g. hover border/pointer
  via `cursor: pointer`, focus ring) so users can tell a card is clickable; the
  current identical rendering of clickable/non-clickable cards is itself a
  usability bug.