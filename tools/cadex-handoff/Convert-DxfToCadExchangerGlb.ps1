param(
  [Parameter(Position = 0)]
  [string]$InputDxf = "C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf",

  [Parameter(Position = 1)]
  [string]$OutputDirectory = "",

  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $scriptPath = $PSCommandPath
  if (-not $scriptPath) {
    throw "This script must be run from a saved .ps1 file."
  }

  return (Resolve-Path (Join-Path (Split-Path -Parent $scriptPath) "..\..")).Path
}

function Get-SafeName([string]$value) {
  $name = [System.IO.Path]::GetFileNameWithoutExtension($value)
  $safe = $name -replace '[^A-Za-z0-9._-]+', '-'
  $safe = $safe.Trim("-")
  if ([string]::IsNullOrWhiteSpace($safe)) {
    return "kairo-cadex-handoff"
  }
  return $safe
}

$repoRoot = Resolve-RepoRoot
$absoluteInputDxf = (Resolve-Path -LiteralPath $InputDxf).Path
$safeBaseName = Get-SafeName $absoluteInputDxf

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path (Split-Path -Parent $absoluteInputDxf) "kairo-cadex-glb"
}

$absoluteOutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
$sceneDirectory = Join-Path $absoluteOutputDirectory "$safeBaseName.scene"
$outputBase = Join-Path $absoluteOutputDirectory $safeBaseName

New-Item -ItemType Directory -Path $absoluteOutputDirectory -Force | Out-Null

Write-Host "Kairo DXF -> CAD Exchanger GLB handoff"
Write-Host "Repo:    $repoRoot"
Write-Host "Input:   $absoluteInputDxf"
Write-Host "Output:  $absoluteOutputDirectory"
Write-Host ""

Push-Location $repoRoot
try {
  if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    throw "pnpm was not found on PATH. Install pnpm or run this from a shell where pnpm is available."
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw "node was not found on PATH. Install Node.js or run this from a shell where node is available."
  }

  if (-not $SkipBuild) {
    Write-Host "Building Kairo CLI..."
    pnpm build
    if ($LASTEXITCODE -ne 0) {
      throw "pnpm build failed with exit code $LASTEXITCODE."
    }
  }

  Write-Host ""
  Write-Host "Importing DXF to neutral Kairo scene..."
  Remove-Item -LiteralPath $sceneDirectory -Recurse -Force -ErrorAction SilentlyContinue
  node ".\packages\cli\dist\index.js" import-dxf "$absoluteInputDxf" "$sceneDirectory" --quiet-warnings
  if ($LASTEXITCODE -ne 0) {
    throw "Kairo DXF import failed with exit code $LASTEXITCODE."
  }

  Write-Host ""
  Write-Host "Writing GLB files for CAD Exchanger..."
  node ".\tools\export-scene-cadex-glb.mjs" "$sceneDirectory" "$outputBase" --scale-to-meters
  if ($LASTEXITCODE -ne 0) {
    throw "GLB export failed with exit code $LASTEXITCODE."
  }
} finally {
  Pop-Location
}

$linesGlb = "$outputBase.materials.lines.glb"
$linesTextGlb = "$outputBase.pro.lines-keytext.glb"
$ribbonsTextGlb = "$outputBase.pro.ribbons-keytext.glb"
$summaryJson = "$outputBase.cadex-summary.json"

Write-Host ""
Write-Host "Done."
Write-Host "Recommended first CAD Exchanger test:"
Write-Host "  $ribbonsTextGlb"
Write-Host ""
Write-Host "Fallbacks:"
Write-Host "  $linesTextGlb"
Write-Host "  $linesGlb"
Write-Host ""
Write-Host "Summary:"
Write-Host "  $summaryJson"
