# check-git-state.ps1
# Pre-flight guard for scheduled cache-refresh tasks. Verifies the repo is in a
# committable state before a scheduled task tries to commit + push.
#
# Exit codes:
#   0 = repo is clean / safe to commit
#   1 = a rebase, merge, cherry-pick, revert or unmerged files block committing
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

if ($blockers.Count -gt 0) {
  Write-Host "BLOCKED: git state not committable -> $($blockers -join ', ')" -NoNewline
  exit 1
}

exit 0