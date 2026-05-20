param(
  [Parameter(Position = 0)]
  [string]$InputDxf = "C:\Users\georgem\Downloads\ScottLayouts\DSP-B-01-7B-0001-24MY-P736-PRO-IMPBASE_20260504_DXF2013.dxf",

  [Parameter(Position = 1)]
  [string]$OutputZipDirectory = "",

  [string]$NodeExe = ""
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

if ([string]::IsNullOrWhiteSpace($OutputZipDirectory)) {
  $OutputZipDirectory = Split-Path -Parent $absoluteInputDxf
}
$absoluteOutputZipDirectory = [System.IO.Path]::GetFullPath($OutputZipDirectory)
New-Item -ItemType Directory -Path $absoluteOutputZipDirectory -Force | Out-Null

if ([string]::IsNullOrWhiteSpace($NodeExe)) {
  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not $nodeCommand) {
    throw "node.exe was not found on this PC. Install Node once on this packaging PC or pass -NodeExe."
  }
  $NodeExe = $nodeCommand.Source
}
$absoluteNodeExe = (Resolve-Path -LiteralPath $NodeExe).Path

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$safeBaseName = Get-SafeName $absoluteInputDxf
$stageRoot = Join-Path $env:TEMP "kairo-cadex-portable-$stamp"
$zipPath = Join-Path $absoluteOutputZipDirectory "kairo-cadex-portable-node-$stamp.zip"

if (Test-Path -LiteralPath $stageRoot) {
  Remove-Item -LiteralPath $stageRoot -Recurse -Force
}

New-Item -ItemType Directory -Path (Join-Path $stageRoot "tools\kairo-cli") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "tools\node") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "input") -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $stageRoot "output") -Force | Out-Null

Copy-Item -LiteralPath (Join-Path $repoRoot "packages\cli\dist\index.js") -Destination (Join-Path $stageRoot "tools\kairo-cli\index.js") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "tools\export-scene-cadex-glb.mjs") -Destination (Join-Path $stageRoot "tools\export-scene-cadex-glb.mjs") -Force
Copy-Item -LiteralPath $absoluteNodeExe -Destination (Join-Path $stageRoot "tools\node\node.exe") -Force
Copy-Item -LiteralPath $absoluteInputDxf -Destination (Join-Path $stageRoot "input\$safeBaseName.dxf") -Force

@"
@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "INPUT_DXF=%~1"
set "OUTPUT_DIR=%~2"
if "%INPUT_DXF%"=="" set "INPUT_DXF=%SCRIPT_DIR%input\$safeBaseName.dxf"
if "%OUTPUT_DIR%"=="" set "OUTPUT_DIR=%SCRIPT_DIR%output"
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Convert-DxfToCadExchangerGlb.ps1" "%INPUT_DXF%" "%OUTPUT_DIR%"
echo.
pause
"@ | Set-Content -LiteralPath (Join-Path $stageRoot "Run-DXF-To-GLB.cmd") -Encoding ASCII

@"
param(
  [Parameter(Position = 0)]
  [string]`$InputDxf = "",

  [Parameter(Position = 1)]
  [string]`$OutputDirectory = ""
)

`$ErrorActionPreference = "Stop"

function Get-SafeName([string]`$value) {
  `$name = [System.IO.Path]::GetFileNameWithoutExtension(`$value)
  `$safe = `$name -replace '[^A-Za-z0-9._-]+', '-'
  `$safe = `$safe.Trim('-')
  if ([string]::IsNullOrWhiteSpace(`$safe)) { return 'kairo-cadex-handoff' }
  return `$safe
}

`$root = Split-Path -Parent `$PSCommandPath
if ([string]::IsNullOrWhiteSpace(`$InputDxf)) {
  `$InputDxf = Join-Path `$root 'input\$safeBaseName.dxf'
}
if ([string]::IsNullOrWhiteSpace(`$OutputDirectory)) {
  `$OutputDirectory = Join-Path `$root 'output'
}

`$bundledNode = Join-Path `$root 'tools\node\node.exe'
if (Test-Path -LiteralPath `$bundledNode) {
  `$node = `$bundledNode
} else {
  `$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if (-not `$nodeCommand) {
    Write-Host "Node.js was not found."
    Write-Host "This package should include tools\node\node.exe. Re-extract the zip or ask for a fresh package."
    exit 2
  }
  `$node = `$nodeCommand.Source
}

`$absoluteInputDxf = (Resolve-Path -LiteralPath `$InputDxf).Path
`$absoluteOutputDirectory = [System.IO.Path]::GetFullPath(`$OutputDirectory)
`$safeOutputBaseName = Get-SafeName `$absoluteInputDxf
`$sceneDirectory = Join-Path `$absoluteOutputDirectory "`$safeOutputBaseName.scene"
`$outputBase = Join-Path `$absoluteOutputDirectory `$safeOutputBaseName
`$cliPath = Join-Path `$root 'tools\kairo-cli\index.js'
`$exporterPath = Join-Path `$root 'tools\export-scene-cadex-glb.mjs'

if (-not (Test-Path -LiteralPath `$cliPath)) { throw "Missing Kairo CLI: `$cliPath" }
if (-not (Test-Path -LiteralPath `$exporterPath)) { throw "Missing GLB exporter: `$exporterPath" }

New-Item -ItemType Directory -Path `$absoluteOutputDirectory -Force | Out-Null
Remove-Item -LiteralPath `$sceneDirectory -Recurse -Force -ErrorAction SilentlyContinue

Write-Host "Kairo DXF -> CAD Exchanger GLB handoff"
Write-Host "Input:  `$absoluteInputDxf"
Write-Host "Output: `$absoluteOutputDirectory"
Write-Host "Node:   `$node"
Write-Host ""

Write-Host "Importing DXF..."
& `$node `$cliPath import-dxf `$absoluteInputDxf `$sceneDirectory --quiet-warnings
if (`$LASTEXITCODE -ne 0) { throw "Kairo DXF import failed with exit code `$LASTEXITCODE." }

Write-Host ""
Write-Host "Writing GLB files..."
& `$node `$exporterPath `$sceneDirectory `$outputBase --scale-to-meters
if (`$LASTEXITCODE -ne 0) { throw "GLB export failed with exit code `$LASTEXITCODE." }

`$ribbonsTextGlb = "`$outputBase.pro.ribbons-keytext.glb"
`$linesTextGlb = "`$outputBase.pro.lines-keytext.glb"
`$linesGlb = "`$outputBase.materials.lines.glb"
`$summaryJson = "`$outputBase.cadex-summary.json"

Write-Host ""
Write-Host "Done."
Write-Host "Open this first in CAD Exchanger:"
Write-Host "  `$ribbonsTextGlb"
Write-Host ""
Write-Host "Fallback GLBs:"
Write-Host "  `$linesTextGlb"
Write-Host "  `$linesGlb"
Write-Host ""
Write-Host "Summary:"
Write-Host "  `$summaryJson"
"@ | Set-Content -LiteralPath (Join-Path $stageRoot "Convert-DxfToCadExchangerGlb.ps1") -Encoding ASCII

@"
KAIRO CAD EXCHANGER GLB HANDOFF

What this is:
- A standalone DXF-to-GLB handoff package for CAD Exchanger testing.
- It imports the included DXF and writes GLB files that CAD Exchanger can open/export to JT.
- Node.js is bundled in tools\node\node.exe, so no Node install is required on the test PC.

Fresh PC requirements:
1. Windows
2. CAD Exchanger

How to run:
1. Extract this zip to a normal folder, for example C:\KairoCadexHandoff.
2. Double-click Run-DXF-To-GLB.cmd.
3. Wait for it to finish.
4. Open the recommended .glb from the output folder in CAD Exchanger.

Default input:
input\$safeBaseName.dxf

Default output folder:
output\

Recommended CAD Exchanger file:
output\$safeBaseName.pro.ribbons-keytext.glb

Fallback files:
output\$safeBaseName.pro.lines-keytext.glb
output\$safeBaseName.materials.lines.glb

Run a different DXF:
Run-DXF-To-GLB.cmd "C:\Path\To\OtherFile.dxf" "C:\Path\To\OutputFolder"

Notes:
- Coordinates are scaled from millimeters to meters for GLB/CAD Exchanger interoperability.
- Text is filtered key stroke text, not full native CAD text fidelity.
- Native JT export is not included; export JT from CAD Exchanger after opening the GLB.
"@ | Set-Content -LiteralPath (Join-Path $stageRoot "README-FIRST.txt") -Encoding ASCII

if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}
Compress-Archive -Path (Join-Path $stageRoot "*") -DestinationPath $zipPath -Force

[pscustomobject]@{
  ZipPath = $zipPath
  StageRoot = $stageRoot
  NodeExe = $absoluteNodeExe
  InputDxf = $absoluteInputDxf
  Bytes = (Get-Item -LiteralPath $zipPath).Length
}
