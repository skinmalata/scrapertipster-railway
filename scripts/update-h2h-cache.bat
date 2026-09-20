@echo off
cd /d C:\Users\Toks\Documents\Apps\Deployed\winfulltime

echo [%date% %time%] Starting H2H scrape...

rem Pre-flight: bail out loudly if a rebase/merge/unmerged state blocks committing.
rem If blocked, park the on-disk cache and retry once after a 5s wait.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-git-state.ps1 >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] WARNING: git repo blocked (rebase/merge/unmerged). Parking cache...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (!(Test-Path '.scheduled-park')) { New-Item -ItemType Directory '.scheduled-park' | Out-Null }; $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; $dst = '.scheduled-park\h2h-unbeaten-cache-' + $stamp + '.json'; if (Test-Path 'h2h-unbeaten-cache.json') { Copy-Item 'h2h-unbeaten-cache.json' $dst -Force }"
    echo [%date% %time%] Waiting 5s then retrying guard...
    timeout /t 5 /nobreak >nul
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-git-state.ps1 >nul 2>&1
    if errorlevel 1 (
        echo [%date% %time%] ERROR: git repo still blocked. Resolve manually and rerun. Snapshot parked in .scheduled-park\.
        exit /b 1
    )
    echo [%date% %time%] Git state cleared after wait; proceeding.
)

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

rem Re-verify git state after scraping (manual rebase may have started).
rem If blocked, park the fresh cache instead of losing it, then fail loudly.
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-git-state.ps1 >nul 2>&1
if errorlevel 1 (
    echo [%date% %time%] ERROR: git became blocked during scrape. Parking fresh cache...
    powershell -NoProfile -ExecutionPolicy Bypass -Command "if (!(Test-Path '.scheduled-park')) { New-Item -ItemType Directory '.scheduled-park' | Out-Null }; $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'; $dst = '.scheduled-park\h2h-unbeaten-cache-' + $stamp + '.json'; if (Test-Path 'h2h-unbeaten-cache.json') { Copy-Item 'h2h-unbeaten-cache.json' $dst -Force }"
    echo [%date% %time%] ERROR: push skipped - resolve manually and rerun.
    exit /b 1
)

git add h2h-unbeaten-cache.json btts-no-cache.json
git diff --cached --quiet
if %errorlevel% equ 0 (
    echo [%date% %time%] No changes to commit
    exit /b 0
)

git commit -m "chore: update h2h cache (%date%)"
git pull --rebase origin main
if %errorlevel% neq 0 (
    echo [%date% %time%] git pull --rebase failed
    exit /b 1
)
git push origin main
if %errorlevel% neq 0 (
    echo [%date% %time%] git push failed - retrying once after pull --rebase
    git pull --rebase origin main
    if %errorlevel% neq 0 (
        echo [%date% %time%] git pull --rebase retry failed
        exit /b 1
    )
    git push origin main
    if %errorlevel% neq 0 (
        echo [%date% %time%] git push retry failed
        exit /b 1
    )
)

echo [%date% %time%] Done
