# scrape-forebet-vip.ps1
# Refreshes forebet-vip-cache.json from Forebet's daily 1X2 predictions using
# the local (residential) IP, which GitHub Actions runners and the Node API
# cannot do because Forebet 403s datacenter IPs. Commits and pushes the cache
# so the Render API can serve it to Pro members via /api/vip.
# Recommended run time: 09:00 WAT / 08:00 UTC (after the source publishes the
# forecast index for the day). Scrapes a 2-day horizon (today, tomorrow).

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$log = Join-Path $env:TEMP 'winfulltime-vip-refresh.log'
Start-Transcript -Path $log -Append | Out-Null

Write-Output "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss zzz') ==="
Set-Location $repo

# Pre-flight: refuse to run (and never partially push) while a rebase, merge,
# cherry-pick, revert or unmerged-file state is blocking the repo. Always park
# a snapshot of any on-disk cache first so fresh data is never lost.
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
  if (Test-Path -LiteralPath "$repo\forebet-vip-cache.json") {
    Copy-Item "$repo\forebet-vip-cache.json" (Join-Path $parkDir "forebet-vip-cache.$stamp.json") -Force
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

$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) {
  foreach ($candidate in @("$env:ProgramFiles\nodejs\node.exe", "$env:LOCALAPPDATA\Programs\nodejs\node.exe")) {
    if (Test-Path -LiteralPath $candidate) { $node = $candidate; break }
  }
}
if (-not $node) { Write-Error 'node not found on PATH or common install locations'; exit 1 }

& $node 'scripts/scrape-forebet-vip.js'
if ($LASTEXITCODE -ne 0) { Write-Error "Scraper failed (exit $LASTEXITCODE)"; exit 1 }

& powershell -NoProfile -ExecutionPolicy Bypass -File "$PSScriptRoot\check-git-state.ps1" 2>$null
if ($LASTEXITCODE -eq 1) {
  $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
  $parkDir = Join-Path $repo '.scheduled-park'
  New-Item -ItemType Directory -Path $parkDir -Force | Out-Null
  Copy-Item "$repo\forebet-vip-cache.json" (Join-Path $parkDir "forebet-vip-cache.$stamp.json") -Force
  Write-Error "Git became blocked while scraping (rebase/merge/unmerged files). Fresh cache parked in $parkDir. Push skipped - resolve manually, then run again."
  exit 1
}

$ErrorActionPreference = 'Continue'

# rebase.autoStash parks any unrelated local edits (uncommitted work in other
# files) for the duration of the rebase and restores them afterwards. Without
# it a single dirty file aborts the rebase and the day's VIP picks never reach
# the site - exactly what happened on 2026-09-26.
# The free Highest-scoring-half market is written to the same commit by
# scripts/scrape-forebet-vip.js, but only the VIP cache was staged here. The
# HSH file is tracked, so its HEAD copy silently froze on whatever CI last
# committed while the VIP cache advanced daily -- which is why it was stuck on
# 2026-09-27. Stage it explicitly.
git add forebet-vip-cache.json highest-scoring-half-cache.json 2>$null
if ($LASTEXITCODE -ne 0) { Write-Output "git add failed (exit $LASTEXITCODE)"; exit 1 }

$cachedChanges = git diff --cached --name-only 2>$null
if (-not $cachedChanges) {
  Write-Output 'No cache changes; nothing to push.'
} else {
  $date = Get-Date -Format 'yyyy-MM-dd'
  git commit -m "chore: update forebet VIP cache ($date)" 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output "git commit failed (exit $LASTEXITCODE)"; exit 1 }
  git -c rebase.autostash=true pull --rebase origin main 2>$null
  if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase failed'; exit 1 }
  git push origin main 2>$null
  if ($LASTEXITCODE -ne 0) {
    Write-Output 'git push failed - retrying once after pull --rebase'
    git -c rebase.autostash=true pull --rebase origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git pull --rebase retry failed'; exit 1 }
    git push origin main 2>$null
    if ($LASTEXITCODE -ne 0) { Write-Output 'git push retry failed'; exit 1 }
  }
  Write-Output 'VIP cache committed and pushed.'
}

Stop-Transcript | Out-Null