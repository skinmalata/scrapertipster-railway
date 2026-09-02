@echo off
cd /d C:\Users\Toks\Documents\Apps\Deployed\winfulltime

echo [%date% %time%] Starting H2H scrape...

node scripts/scrape-h2h-unbeaten.js
if %errorlevel% neq 0 (
    echo [%date% %time%] Unbeaten scraper failed
    exit /b 1
)

node scripts/scrape-btts-no.js
if %errorlevel% neq 0 (
    echo [%date% %time%] BTTS scraper failed
    exit /b 1
)

git add h2h-unbeaten-cache.json btts-no-cache.json
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [%date% %time%] No changes to commit
    exit /b 0
)

git commit -m "chore: update h2h cache (%date%)"
git push origin main

echo [%date% %time%] Done
