# refresh-unbeaten-daily.ps1
# Refreshes h2h-unbeaten-cache.json from h2hstats.net using the local (residential)
# IP, which GitHub Actions runners cannot use because h2hstats.net 403s datacenter
# IPs. Commits and pushes the refreshed cache so the CI deploy crons can publish it.
# Scrapes a 3-day horizon (today .. today+2) so the cache always covers the
# coming days even if a scheduled run is missed. Run once daily (Task Scheduler)
# to keep streak data as fresh as possible.
# Recommended run time: 08:30 WAT / 07:30 UTC, after the source populates fixtures.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:TEMP 'winfulltime-unbeaten-refresh.log'
Start-Transcript -Path $log -Append | Out-Null

Write-Output "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') ==="
Set-Location $repo

# Pre-flight: refuse to run (and never partially push) while a rebase, merge,
# cherry-pick, revert or unmerged-file state is blocking the repo. This is the
# exact failure that silently hid today's cache earlier. Always park a snapshot
# of any on-disk cache first so fresh data is never lost even when git is stuck.
# Guard exit 2 = dirty working tree; the rebase below auto-stashes it, so warn
# loudly and carry on rather than skipping a whole day of picks.
$guard = & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
$gitBlocked = ($LASTEXITCODE -eq 1)
if ($LASTEXITCODE -eq 2) {
  Write-Warning 'Git working tree is dirty (uncommitted tracked changes). Continuing - the rebase below will auto-stash them.'
}
if ($gitBlocked) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $parkDir = Join-Path $repo '.scheduled-park'
  New-Item -ItemType Directory -Path $parkDir -Force | Out-Null
  if (Test-Path -LiteralPath "$repo\h2h-unbeaten-cache.json") {
    Copy-Item "$repo\h2h-unbeaten-cache.json" (Join-Path $parkDir "h2h-unbeaten-cache.$stamp.json") -Force
  }
  Write-Warning "Git repo BLOCKED (rebase/merge/unmerged files). Snapshot parked in $parkDir. Waiting 5s then retrying once..."
  Start-Sleep -Seconds 5
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
  if ($LASTEXITCODE -eq 1) {
    Write-Error "Git repo still blocked (rebase/merge/unmerged files). Resolve manually, then run again. Snapshot parked in $parkDir."
    exit 1
  }
  Write-Output 'Git state cleared after wait; proceeding.'
}

# Resolve node (Task Scheduler may have a limited PATH)
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($candidate in @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if (Test-Path -LiteralPath $candidate) { $node = $candidate; break }
  }
}
if (-not $node) { Write-Error 'node not found on PATH or common install locations'; exit 1 }

# 1) Refresh the cache for the next 3 days (today .. today+2, in UTC to match the scraper)
$utcNow = [DateTime]::UtcNow
$dates = 0..2 | ForEach-Object { $utcNow.AddDays($_).ToString('yyyy-MM-dd') }
Write-Output "Scraping dates: $($dates -join ', ')"
& $node 'scripts/scrape-h2h-unbeaten.js' $dates
if ($LASTEXITCODE -ne 0) { Write-Error "Scraper failed (exit $LASTEXITCODE)"; exit 1 }

# Re-verify git state after scraping (a manual rebase may have started meanwhile).
# If blocked now, park the freshly scraped cache instead of losing it, then fail loudly.
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
if ($LASTEXITCODE -eq 1) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $parkDir = Join-Path $repo '.scheduled-park'
  New-Item -ItemType Directory -Path $parkDir -Force | Out-Null
  Copy-Item "$repo\h2h-unbeaten-cache.json" (Join-Path $parkDir "h2h-unbeaten-cache.$stamp.json") -Force
  Write-Error "Git became blocked while scraping (rebase/merge/unmerged files). Fresh cache parked in $parkDir. Push skipped - resolve manually, then run again."
  exit 1
}

# 2) Commit + push if the cache changed.
# git writes warnings (e.g. the CRLF line-ending notice) to stderr; under
# $ErrorActionPreference='Stop' those would abort the script. Relax it for the
# git section, redirect stderr away, and gate on exit codes instead.
# rebase.autoStash parks any unrelated local edits (uncommitted work in other
# files) for the duration of the rebase and restores them afterwards. Without
# it a single dirty file aborts the rebase and the day's cache never reaches the
# site - exactly what happened on 2026-09-26.
$ErrorActionPreference = 'Continue'

git add h2h-unbeaten-cache.json 2>$null
if ($LASTEXITCODE -ne 0) { Write-Output "git add failed (exit $LASTEXITCODE)"; exit 1 }

$cachedChanges = git diff --cached --name-only 2>$null
if (-not $cachedChanges) {
  Write-Output 'No cache changes; nothing to push.'
} else {
  $date = Get-Date -Format 'yyyy-MM-dd'
  git commit -m "chore: update unbeaten streak cache ($date)" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output "git commit failed (exit $LASTEXITCODE)"; exit 1 }
  git -c rebase.autostash=true pull --rebase origin main 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase failed'; exit 1 }
  git push origin main 2>$null
  if ($LASTEXITCODE -ne 0) {
    # Non-fast-forward (remote moved since we pulled): rebase onto the new remote
    # and retry once instead of giving up silently.
    Write-Output 'git push failed - retrying once after pull --rebase'
    git -c rebase.autostash=true pull --rebase origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase retry failed'; exit 1 }
    git push origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git push retry failed'; exit 1 }
  }
  Write-Output 'Cache committed and pushed.'
}

Stop-Transcript | Out-Null
