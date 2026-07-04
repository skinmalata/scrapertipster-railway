param(
  [string]$RootDir = "public"
)

$totalFiles = 0
$modifiedFiles = @()

function Write-Log($msg) {
  Write-Host $msg -ForegroundColor Cyan
}

function Update-CssVariableFile($content) {
  # 1. Replace :root block with light theme values
  $rootStart = $content.IndexOf(":root")
  if ($rootStart -ge 0) {
    # Find the opening brace after :root
    $braceStart = $content.IndexOf("{", $rootStart)
    if ($braceStart -ge 0) {
      # Find the matching closing brace
      $depth = 1
      $pos = $braceStart + 1
      while ($depth -gt 0 -and $pos -lt $content.Length) {
        $c = $content[$pos]
        if ($c -eq '{') { $depth++ }
        elseif ($c -eq '}') { $depth-- }
        $pos++
      }
      $braceEnd = $pos - 1

      $rootBlock = $content.Substring($rootStart, $braceEnd - $rootStart + 1)
      $lightBlock = @"
:root {
  --bg-primary: #f4f6fa;
  --bg-secondary: #ffffff;
  --bg-card: rgba(255,255,255,0.9);
  --bg-card-hover: rgba(240,242,245,0.95);
  --bg-elevated: #e8ecf1;
  --text-primary: #1a1d23;
  --text-secondary: #4a4f59;
  --text-muted: #6b7280;
  --accent: #ff2448;
  --accent-gradient: linear-gradient(135deg, #ff2448, #d41a38);
  --border: rgba(0,0,0,0.08);
  --border-hover: rgba(0,0,0,0.14);
  --glow: rgba(255,36,72,0.08);
  --radius: 12px;
  --radius-lg: 16px;
  --font: system-ui, -apple-system, sans-serif;
  }
"@
      $content = $content.Remove($rootStart, $braceEnd - $rootStart + 1)
      $content = $content.Insert($rootStart, $lightBlock)
    }
  }

  # 2. Remove [data-theme="light"] block (including all content between braces)
  $content = $content -replace '(?s)\[data-theme="light"\][^{]*\{[^}]*\}', ''

  # 3. Replace var(--font) with system-ui
  $content = $content -replace 'var\(--font\)', 'system-ui, -apple-system, sans-serif'

  # 4. Remove background-image radial gradient from body
  $content = $content -replace 'background-image:\s*radial-gradient\([^;]+;\s*', ''

  # 5. Remove Inter font link lines individually
  $content = $content -replace '<link rel="preconnect" href="https://fonts\.googleapis\.com"[^>]*>\s*', ''
  $content = $content -replace '<link rel="preconnect" href="https://fonts\.gstatic\.com"[^>]*>\s*', ''
  $content = $content -replace '<link href="https://fonts\.googleapis\.com[^"]*"[^>]*>\s*', ''

  # 6. Replace dark glass header with light glass
  $content = $content -replace 'background:\s*rgba\(\s*11\s*,\s*15\s*,\s*26\s*,\s*0\.85\s*\)', 'background: rgba(255,255,255,0.9)'

  # 7. Remove backdrop-filter + -webkit-backdrop-filter (both)
  $content = $content -replace '(?:-\w+-\s*)?backdrop-filter:\s*blur\(\s*20px\s*\);?\s*', ''

  # 8. Change h1 gradient in hero from dark text gradient to dark solid color
  $content = $content -replace 'background:\s*linear-gradient\(135deg,\s*#e8edf5\s*0%\s*,\s*#94a3b8\s*100%\s*\)', 'color: #1a1d23'
  $content = $content -replace '-webkit-background-clip:\s*text;\s*-webkit-text-fill-color:\s*transparent;\s*background-clip:\s*text;', ''

  return $content
}

function Update-HardcodedDarkFile($content) {
  # 1. Remove background-image radial gradient
  $content = $content -replace 'background-image:\s*radial-gradient\([^;]+;\s*', ''

  # 2. Remove Inter font link lines individually
  $content = $content -replace '<link rel="preconnect" href="https://fonts\.googleapis\.com"[^>]*>\s*', ''
  $content = $content -replace '<link rel="preconnect" href="https://fonts\.gstatic\.com"[^>]*>\s*', ''
  $content = $content -replace '<link href="https://fonts\.googleapis\.com[^"]*"[^>]*>\s*', ''
  $content = $content -replace '@import\s+url\(''https://fonts\.googleapis\.com[^)]+\);\s*', ''

  # 3. Replace font-family with Inter to system-ui (keep rest of font stack)
  $content = $content -replace "font-family:\s*'Inter',\s*system-ui", "font-family: system-ui"
  $content = $content -replace "font-family:\s*'Inter',\s*sans-serif", "font-family: system-ui, sans-serif"
  $content = $content -replace "font-family:\s*'Inter',\s*", "font-family: "
  # Fix cases where only 'sans-serif' remains
  $content = $content -replace "font-family:\s*sans-serif", "font-family: system-ui, sans-serif"

  # 4. Replace dark glass header with light
  $content = $content -replace 'background:\s*rgba\(\s*11\s*,\s*15\s*,\s*26\s*,\s*0\.85\s*\)', 'background: rgba(255,255,255,0.9)'
  $content = $content -replace 'background:\s*rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.8\s*\)', 'background: rgba(255,255,255,0.9)'
  $content = $content -replace 'background:\s*rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.6\s*\)', 'background: rgba(255,255,255,0.8)'

  # 5. Remove backdrop-filter + -webkit-backdrop-filter (both)
  $content = $content -replace '(?:-\w+-\s*)?backdrop-filter:\s*blur\(\s*\d+px\s*(?:\s*saturate\([^)]+\))?\);?\s*', ''

  # 6. Replace dark color values with light ones
  # body bg: #0b0f1a -> #f4f6fa (but not when used as color: value)
  $content = $content -replace '(?<![\w-])#0b0f1a', '#f4f6fa'
  # Alternate dark bg: #0a0e17 -> #f4f6fa (only when used as background value)
  $content = $content -replace '(?<=background:\s*)#0a0e17', '#f4f6fa'
  $content = $content -replace '(?<=background:\s*linear-gradient\([^,]+,\s*)#0a0e17', '#f4f6fa'
  $content = $content -replace '(?<=background:\s*linear-gradient\([^,]+,\s*[^,]+,\s*)#141c2a', '#e8ecf1'
  # Also handle gradient rgba(20,28,42,0.8), rgba(10,14,23,0.9)
  $content = $content -replace 'rgba\(\s*20\s*,\s*28\s*,\s*42\s*,\s*0\.8\s*\)', 'rgba(255,255,255,0.9)'
  $content = $content -replace 'rgba\(\s*10\s*,\s*14\s*,\s*23\s*,\s*0\.9\s*\)', 'rgba(240,242,245,0.95)'

  # bg-secondary: #111827 -> #ffffff
  $content = $content -replace '(?<![\w-])#111827', '#ffffff'

  # bg-elevated: #1a1f2e -> #e8ecf1
  $content = $content -replace '(?<![\w-])#1a1f2e', '#e8ecf1'

  # text colors - be more careful, only replace as standalone values
  $content = $content -replace '(?<=:\s*)#e8edf5', '#1a1d23'
  $content = $content -replace '(?<=:\s*)#c8d0db', '#4a4f59'
  $content = $content -replace '(?<=:\s*)#94a3b8', '#6b7280'

  # rgba text colors like rgba(232,237,245,0.5) -> rgba(74,79,89,0.7)
  $content = $content -replace 'rgba\(232,\s*237,\s*245,\s*0\.5\)', 'rgba(74,79,89,0.7)'
  $content = $content -replace 'rgba\(232,\s*237,\s*245,\s*0\.25\)', 'rgba(74,79,89,0.4)'

  # rgba white text in inline styles
  $content = $content -replace 'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.85\s*\)', 'rgba(74,79,89,0.85)'

  # Border colors (rgba white -> rgba black)
  $content = $content -replace 'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.06\s*\)', 'rgba(0,0,0,0.08)'
  $content = $content -replace 'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.12\s*\)', 'rgba(0,0,0,0.14)'
  $content = $content -replace 'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.08\s*\)', 'rgba(0,0,0,0.10)'
  $content = $content -replace 'rgba\(\s*255\s*,\s*255\s*,\s*255\s*,\s*0\.04\s*\)', 'rgba(0,0,0,0.06)'

  # Card backgrounds rgba(23,28,46,0.85) -> rgba(255,255,255,0.9)
  $content = $content -replace 'rgba\(\s*23\s*,\s*28\s*,\s*46\s*,\s*0\.85\s*\)', 'rgba(255,255,255,0.9)'

  # Form backgrounds: linear-gradient(135deg, rgba(30,42,58,0.6), rgba(15,25,35,0.8)) -> rgba(255,255,255,0.9)
  $content = $content -replace 'linear-gradient\(135deg,\s*rgba\(30,\s*42,\s*58,\s*0\.6\),\s*rgba\(15,\s*25,\s*35,\s*0\.8\)\)', 'rgba(255,255,255,0.9)'

  return $content
}

function Test-IsCssVariableFile($content) {
  return $content -match ':root\s*\{[^}]*--bg-primary:\s*#0b0f1a'
}

function Test-IsDarkThemed($content) {
  return ($content -match '#0b0f1a' -or $content -match '--bg-primary:\s*#0b0f1a' -or $content -match '#0a0e17')
}

# Get all HTML files
$files = Get-ChildItem -Path $RootDir -Recurse -Filter "*.html" | Where-Object { $_.FullName -notmatch 'node_modules' }

Write-Log "Scanning $($files.Count) HTML files for dark theme..."

foreach ($file in $files) {
  $content = Get-Content -Path $file.FullName -Raw
  $original = $content

  if (-not (Test-IsDarkThemed $content)) {
    continue
  }

  $totalFiles++
  Write-Log "Processing: $($file.FullName)"

  if (Test-IsCssVariableFile $content) {
    $content = Update-CssVariableFile $content
  } else {
    $content = Update-HardcodedDarkFile $content
  }

  if ($content -ne $original) {
    Set-Content -Path $file.FullName -Value $content -NoNewline -Encoding UTF8
    $modifiedFiles += $file.FullName
    Write-Log "  -> MODIFIED"
  } else {
    Write-Log "  -> No changes needed"
  }
}

Write-Log "`n=== Summary ==="
Write-Log "Files scanned: $($files.Count)"
Write-Log "Dark-themed files found: $totalFiles"
Write-Log "Files modified: $($modifiedFiles.Count)"
