# Pinterest Upgrade Demo - Voiceover Script

## Step 1 — Config (0:00–0:10)
"Here's our `.env` file with the Pinterest access token and board ID. The app authenticates using OAuth 2.0 — the token was generated from the Pinterest developer dashboard with `pins:write` and `boards:write` scopes."

## Step 2 — Generate pins (0:10–0:30)
"We run `npm run generate-pins`. This reads today's predictions from our cache — 1X2, Over 2.5, Over 1.5, and BTTS — then uses Puppeteer to render each as a 1080×1920 PNG. Twenty pins are generated in about 30 seconds, saved to the `public/pins/` directory."

## Step 3 — Show pins (0:30–0:40)
"Each pin shows the match, tip type, teams stacked vertically, the predicted outcome, probability percentage, and our website — all in a bold, mobile-friendly layout."

## Step 4 — Post to Pinterest (0:40–0:55)
"We run `npm run post-pins`. The script reads each image, encodes it as base64, and sends it to the Pinterest API v5 endpoint with the board ID, title, description, and alt text. A half-second delay between posts avoids rate limits."

## Step 5 — Result (0:55–1:00)
"All 20 pins are now live on the Pinterest board — automated daily with no manual work."

---

## Demo Recording Tips
- Use OBS or any screen recorder
- Show terminal with colored output for visual clarity
- Open `.env` briefly (hide secret key if visible)
- Show `public/pins/` folder with file thumbnails
- End on your Pinterest board showing the pins live
