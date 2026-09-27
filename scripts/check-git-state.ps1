# check-git-state.ps1
# Pre-flight guard for scheduled cache-refresh tasks. Verifies the repo is in a
# committable state before a scheduled task tries to commit + push.
#
# Exit codes:
#   0 = repo is clean / safe to commit
#   1 = a rebase, merge, cherry-pick, revert, bisect or unmerged files block
#       committing. Hard stop - the caller must not touch the index.
#   2 = tracked files have uncommitted changes (staged and/or unstaged). Not a
#       hard stop: the refresh scripts rebase with rebase.autoStash=true, which
#       parks local edits safely, so the caller only warns loudly and proceeds.
#       Without this, a single unrelated local edit made "git pull --rebase"
#       fail and silently dropped a day's cache push.
#
# Usage:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/check-git-state.ps1

$ErrorActionPreference = 'Stop'

$repo = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
Set-Location $repo

$gitDir = Join-Path $repo '.git'

$blockers = @()

# 1) In-progress operations that stash pending commit state
foreach ($marker in @(
  @{ Name = 'rebase (interactive)'; Path = Join-Path $gitDir 'rebase-merge' },
  @{ Name = 'rebase';                Path = Join-Path $gitDir 'rebase-apply' },
  @{ Name = 'merge';                 Path = Join-Path $gitDir 'MERGE_HEAD' },
  @{ Name = 'cherry-pick';           Path = Join-Path $gitDir 'CHERRY_PICK_HEAD' },
  @{ Name = 'revert';                Path = Join-Path $gitDir 'REVERT_HEAD' },
  @{ Name = 'bisect';                Path = Join-Path $gitDir 'BISECT_LOG' }
)) {
  if (Test-Path -LiteralPath $marker.Path) {
    $blockers += $marker.Name
  }
}

# 2) Unmerged / conflicted paths in the index
$unmerged = git ls-files -u 2>$null
if ($LASTEXITCODE -eq 0 -and $unmerged) {
  $blockers += 'unmerged files'
}

# 3) Tracked-file changes. 'git pull --rebase' refuses to run with either staged
# or unstaged tracked changes, so these must be reported. Untracked ('??') paths
# are informational only - they never block a rebase.
$status = @(git status --porcelain 2>$null | Where-Object { $_ })
$dirty = @($status | Where-Object { -not $_.StartsWith('??') })
$untracked = @($status | Where-Object { $_.StartsWith('??') })

if ($blockers.Count -gt 0) {
  Write-Host "BLOCKED: git state not committable -> $($blockers -join ', ')" -NoNewline
  exit 1
}

if ($dirty.Count -gt 0) {
  Write-Host "DIRTY: $($dirty.Count) tracked file(s) with uncommitted changes:"
  $dirty | ForEach-Object { Write-Host "  $_" }
  if ($untracked.Count -gt 0) {
    Write-Host "  (+$($untracked.Count) untracked file(s), harmless for rebase)"
  }
  Write-Host 'Rebase will auto-stash these; the cache commit + push still proceeds.' -NoNewline
  exit 2
}

if ($untracked.Count -gt 0) {
  Write-Host "CLEAN: $($untracked.Count) untracked file(s) only - safe to commit." -NoNewline
}

exit 0