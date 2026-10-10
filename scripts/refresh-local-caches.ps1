# refresh-local-caches.ps1
# Single daily local cache-refresh job for WinFulltime. Replaces the three
# separate scheduled tasks (refresh-unbeaten-daily.ps1, scrape-forebet-vip.ps1,
# update-h2h-cache.bat) with one orchestrator that runs every IP-restricted
# scrape from this machine's residential address, then commits + pushes the
# refreshed caches in a single commit.
#
# Why local: h2hstats.net and Forebet 403 GitHub Actions datacenter IPs, so
# these sources can only be scraped here. Everything else (generating the
# ~15k prediction pages) still runs in CI via scripts/gh-pages-scraper.js,
# which reads these caches. Pushing a cache file matches the deploy workflow's
# `paths:` filter, so the push above re-triggers the Pages build automatically.
#
# Scrapers run in sequence:
#   1) scrape-h2h-unbeaten.js    -> h2h-unbeaten-cache.json      (3-day horizon)
#   2) scrape-btts-no.js         -> btts-no-cache.json           (3-day horizon)
#   3) scrape-forebet-vip.js     -> forebet-vip-cache.json
#                                   highest-scoring-half-cache.json
# A failure in one does not abort the others; whatever refreshed still gets
# pushed, and the task exits non-zero so Task Scheduler flags the run.
#
# Recommended run time: 09:00 WAT / 08:00 UTC, after both sources publish.

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:TEMP 'winfulltime-local-caches.log'
Start-Transcript -Path $log -Append | Out-Null

Write-Output "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') ==="
Set-Location $repo

$cacheFiles = @(
  'h2h-unbeaten-cache.json',
  'btts-no-cache.json',
  'forebet-vip-cache.json',
  'highest-scoring-half-cache.json'
)

function Park-Caches {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $parkDir = Join-Path $repo '.scheduled-park'
  New-Item -ItemType Directory -Path $parkDir -Force | Out-Null
  foreach ($f in $cacheFiles) {
    if (Test-Path -LiteralPath "$repo\$f") {
      Copy-Item "$repo\$f" (Join-Path $parkDir "$f.$stamp.json") -Force
    }
  }
  return $parkDir
}

# Pre-flight: refuse to run (and never partially push) while a rebase, merge,
# cherry-pick, revert or unmerged-file state is blocking the repo. Always park
# a snapshot of any on-disk cache first so fresh data is never lost.
# Guard exit 2 = dirty working tree; the rebase below auto-stashes it, so warn
# loudly and carry on rather than skipping a whole day of picks.
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
$guardExit = $LASTEXITCODE
if ($guardExit -eq 2) {
  Write-Warning 'Git working tree is dirty (uncommitted tracked changes). Continuing - the rebase below will auto-stash them.'
}
if ($guardExit -eq 1) {
  $parkDir = Park-Caches
  Write-Warning "Git repo BLOCKED (rebase/merge/unmerged files). Snapshot parked in $parkDir. Waiting 5s then retrying once..."
  Start-Sleep -Seconds 5
  & powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
  if ($LASTEXITCODE -eq 1) {
    Write-Error "Git repo still blocked (rebase/merge/unmerged files). Resolve manually, then run again. Snapshot parked in $parkDir."
    Stop-Transcript | Out-Null
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

$failed = @()

# Shared 3-day horizon (today .. today+2, UTC to match the scrapers).
$utcNow = [DateTime]::UtcNow
$dates = 0..2 | ForEach-Object { $utcNow.AddDays($_).ToString('yyyy-MM-dd') }

# 1) H2H unbeaten streaks.
Write-Output "=== scrape-h2h-unbeaten ($($dates -join ', ')) ==="
& $node 'scripts/scrape-h2h-unbeaten.js' $dates
if ($LASTEXITCODE -ne 0) { Write-Warning "h2h-unbeaten scraper failed (exit $LASTEXITCODE)"; $failed += 'h2h-unbeaten' }

# 2) BTTS - No.
Write-Output "=== scrape-btts-no ($($dates -join ', ')) ==="
& $node 'scripts/scrape-btts-no.js' $dates
if ($LASTEXITCODE -ne 0) { Write-Warning "btts-no scraper failed (exit $LASTEXITCODE)"; $failed += 'btts-no' }

# 3) Forebet VIP (1X2) + free highest-scoring-half. Uses the Lagos 2-day horizon.
Write-Output '=== scrape-forebet-vip ==='
& $node 'scripts/scrape-forebet-vip.js'
if ($LASTEXITCODE -ne 0) { Write-Warning "forebet-vip scraper failed (exit $LASTEXITCODE)"; $failed += 'forebet-vip' }

# Re-verify git state after scraping (a manual rebase may have started meanwhile).
& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
if ($LASTEXITCODE -eq 1) {
  $parkDir = Park-Caches
  Write-Error "Git became blocked while scraping. Fresh caches parked in $parkDir. Push skipped - resolve manually, then run again."
  Stop-Transcript | Out-Null
  exit 1
}

# Commit + push if any cache changed.
# git writes warnings (e.g. the CRLF line-ending notice) to stderr; under
# $ErrorActionPreference='Stop' those would abort the script. Relax it for the
# git section, redirect stderr away, and gate on exit codes instead.
# rebase.autoStash parks any unrelated local edits for the duration of the
# rebase and restores them afterwards, so a single dirty file cannot abort the
# rebase and silently drop the day's push.
$ErrorActionPreference = 'Continue'

git add $cacheFiles 2>$null
if ($LASTEXITCODE -ne 0) { Write-Output "git add failed (exit $LASTEXITCODE)"; Stop-Transcript | Out-Null; exit 1 }

$cachedChanges = git diff --cached --name-only 2>$null
if (-not $cachedChanges) {
  Write-Output 'No cache changes; nothing to push.'
} else {
  $date = Get-Date -Format 'yyyy-MM-dd'
  git commit -m "chore: refresh local caches (h2h/btts-no/vip/hsh) $date" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output "git commit failed (exit $LASTEXITCODE)"; Stop-Transcript | Out-Null; exit 1 }
  git -c rebase.autostash=true pull --rebase origin main 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase failed'; Stop-Transcript | Out-Null; exit 1 }
  git push origin main 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Output 'git push failed - retrying once after pull --rebase'
    git -c rebase.autostash=true pull --rebase origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase retry failed'; Stop-Transcript | Out-Null; exit 1 }
    git push origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git push retry failed'; Stop-Transcript | Out-Null; exit 1 }
  }
  Write-Output 'Caches committed and pushed (push triggers the Pages deploy).'
}

if ($failed.Count -gt 0) {
  Write-Warning "Scrapers that failed: $($failed -join ', ')"
  Stop-Transcript | Out-Null
  exit 1
}

Write-Output 'All local caches refreshed.'
Stop-Transcript | Out-Null
