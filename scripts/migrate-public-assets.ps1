# One-time migration: role-based public/models + public/textures/environment layout.
# Usage:
#   .\scripts\migrate-public-assets.ps1
#   .\scripts\migrate-public-assets.ps1 -TargetRoot models
#   .\scripts\migrate-public-assets.ps1 -WhatIf

param(
  [string]$RepoRoot = (Split-Path -Parent $PSScriptRoot),
  [ValidateSet('public', 'models')]
  [string]$TargetRoot = 'public',
  [switch]$WhatIf
)

$ErrorActionPreference = 'Stop'
$root = Join-Path $RepoRoot $TargetRoot
if ($TargetRoot -eq 'public') {
  $models = Join-Path $root 'models'
  $textures = Join-Path $root 'textures'
} else {
  # Gitignored authoring warehouse: packs live directly under models/, not models/models/
  $models = $root
  $textures = Join-Path $root 'textures'
}

function Write-Action([string]$msg) {
  if ($WhatIf) { Write-Host "[WhatIf] $msg" -ForegroundColor Yellow }
  else { Write-Host $msg -ForegroundColor Green }
}

function Ensure-Parent([string]$path) {
  $parent = Split-Path -Parent $path
  if ($parent -and -not (Test-Path $parent)) {
    if ($WhatIf) { Write-Action "mkdir $parent" }
    else { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
  }
}

function Move-Pack([string]$from, [string]$to) {
  $src = Join-Path $models $from
  $dst = Join-Path $models $to
  if (-not (Test-Path $src)) {
    Write-Host "skip (no source): $src" -ForegroundColor DarkGray
    return
  }
  if (Test-Path $dst) {
    Write-Host "skip (dest exists): $dst" -ForegroundColor DarkGray
    return
  }
  Ensure-Parent $dst
  Write-Action "move $src -> $dst"
  if (-not $WhatIf) { Move-Item -LiteralPath $src -Destination $dst }
}

function Copy-EnvFile([string]$fromRel, [string]$toRel) {
  $src = Join-Path $models $fromRel
  $dst = Join-Path $textures $toRel
  if (-not (Test-Path $src)) {
    Write-Host "skip (no source): $src" -ForegroundColor DarkGray
    return
  }
  Ensure-Parent $dst
  Write-Action "copy $src -> $dst"
  if (-not $WhatIf) { Copy-Item -LiteralPath $src -Destination $dst -Force }
}

function Remove-IfEmpty([string]$path) {
  if (-not (Test-Path $path)) { return }
  $items = Get-ChildItem -LiteralPath $path -Force -ErrorAction SilentlyContinue
  if ($items -and $items.Count -gt 0) {
    Write-Host "keep (not empty): $path" -ForegroundColor DarkGray
    return
  }
  Write-Action "remove empty $path"
  if (-not $WhatIf) { Remove-Item -LiteralPath $path -Force -Recurse -ErrorAction SilentlyContinue }
}

Write-Host "=== migrate-public-assets ($TargetRoot) ===" -ForegroundColor Cyan

Move-Pack 'Stylized Nature Megakit\glTF' 'props\nature'
Move-Pack 'grass\grass_medium_01_4k' 'foliage\grass-medium-01'
Move-Pack 'converted' 'landmarks\ruins'
Move-Pack 'Ultimate Fantasy RTS - Aug 2022\glTF' 'landmarks\mountains'

Ensure-Parent (Join-Path $textures 'environment\cloud-puff.png')
if ($TargetRoot -eq 'public') {
  Copy-EnvFile 'sky\cloud_puff.png' 'environment\cloud-puff.png'
  Copy-EnvFile 'hdri\NightSkyHDRI012_8K_HDR.exr' 'environment\night-sky.exr'
  foreach ($legacy in @('sky', 'hdri')) {
    $legPath = Join-Path $models $legacy
    if (Test-Path $legPath) {
      Write-Action "remove legacy $legPath"
      if (-not $WhatIf) { Remove-Item -LiteralPath $legPath -Force -Recurse }
    }
  }
}

if ($TargetRoot -eq 'public') {
  $grassReadmeSrc = Join-Path $models 'grass\README.md'
  $grassReadmeDst = Join-Path $models 'foliage\grass-medium-01\README.md'
  if ((Test-Path $grassReadmeSrc) -and -not (Test-Path $grassReadmeDst)) {
    Ensure-Parent $grassReadmeDst
    Write-Action "move $grassReadmeSrc -> $grassReadmeDst"
    if (-not $WhatIf) { Move-Item -LiteralPath $grassReadmeSrc -Destination $grassReadmeDst }
  }

  $texGrassReadme = Join-Path $textures 'grass\README.md'
  if (Test-Path $texGrassReadme) {
    Write-Action "remove $texGrassReadme"
    if (-not $WhatIf) { Remove-Item -LiteralPath $texGrassReadme -Force }
  }
  $texGrassDir = Join-Path $textures 'grass'
  Remove-IfEmpty $texGrassDir
}

Remove-IfEmpty (Join-Path $models 'converted')
Remove-IfEmpty (Join-Path $models 'grass')
Remove-IfEmpty (Join-Path $models 'Stylized Nature Megakit')
Remove-IfEmpty (Join-Path $models 'Ultimate Fantasy RTS - Aug 2022')

Write-Host "=== done ===" -ForegroundColor Cyan
