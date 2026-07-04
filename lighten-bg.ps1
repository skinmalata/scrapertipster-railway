param(
  [string]$RootDir = "public"
)

$count = 0

$files = Get-ChildItem -Path $RootDir -Recurse -Filter "*.html" | Where-Object { $_.FullName -notmatch 'node_modules' }

foreach ($file in $files) {
  $content = Get-Content -Path $file.FullName -Raw
  $original = $content

  # === Dark backgrounds: make them lighter ===
  # #0b0f1a (primary) -> #181e30
  $content = $content -replace '(?<![\w-])#0b0f1a', '#181e30'

  # #111827 (secondary) -> #1e2538
  $content = $content -replace '(?<![\w-])#111827', '#1e2538'

  # #1a1f2e (elevated) -> #252c40
  $content = $content -replace '(?<![\w-])#1a1f2e', '#252c40'

  # rgba(11,15,26,0.85) -> rgba(24,30,48,0.85)
  $content = $content -replace 'rgba\(\s*11\s*,\s*15\s*,\s*26\s*,\s*0\.85\s*\)', 'rgba(24,30,48,0.85)'

  # #0a0e17 in ticket-builder (NOT in color: context)
  $content = $content -replace '(?<!color:\s*)#0a0e17', '#151a2c'

  # rgba(10,14,23,*) -> rgba(21,26,44,*)
  $content = $content -replace 'rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.8\s*\)', 'rgba(21,26,44,0.8)'
  $content = $content -replace 'rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.6\s*\)', 'rgba(21,26,44,0.6)'
  $content = $content -replace 'rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.9\s*\)', 'rgba(21,26,44,0.9)'

  # #141c2a (CTA gradient) -> #20273b
  $content = $content -replace '(?<![\w-])#141c2a', '#20273b'

  # rgba(20,28,42,0.8) -> rgba(30,38,56,0.85)
  $content = $content -replace 'rgba\(\s*20\s*,\s*28\s*,\s*42\s*,\s*0\.8\s*\)', 'rgba(30,38,56,0.85)'
  # rgba(15,25,35,0.8) -> rgba(30,38,56,0.9)
  $content = $content -replace 'rgba\(\s*15\s*,\s*25\s*,\s*35\s*,\s*0\.8\s*\)', 'rgba(30,38,56,0.9)'
  # rgba(30,42,58,0.6) -> rgba(37,46,64,0.65)
  $content = $content -replace 'rgba\(\s*30\s*,\s*42\s*,\s*58\s*,\s*0\.6\s*\)', 'rgba(37,46,64,0.65)'

  if ($content -ne $original) {
    Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
    $count++
  }
}

Write-Host "Updated $count files"
