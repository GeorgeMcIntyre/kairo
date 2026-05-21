param(
  [Parameter(Mandatory = $true)]
  [string[]] $InputDxf,

  [Parameter(Mandatory = $false)]
  [string] $OutputDirectory = "C:\tmp\kairo-packages",

  [Parameter(Mandatory = $false)]
  [string] $CliPath = ".\packages\cli\dist\index.js",

  [Parameter(Mandatory = $false)]
  [int] $NodeMaxOldSpaceMb = 12288,

  [switch] $RedactSourcePaths
)

$ErrorActionPreference = "Stop"

function Assert-RepoCli {
  param([string] $Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Kairo CLI was not found at '$Path'. Run 'pnpm build' first or pass -CliPath."
  }
}

Assert-RepoCli -Path $CliPath
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

$results = @()
foreach ($source in $InputDxf) {
  $absoluteSource = (Resolve-Path -LiteralPath $source).Path
  $baseName = [System.IO.Path]::GetFileNameWithoutExtension($absoluteSource)
  $packagePath = Join-Path $OutputDirectory "$baseName.kairo"
  $reportPath = Join-Path $OutputDirectory "$baseName.report.json"
  $arguments = @(
    $CliPath,
    "import-dxf-package",
    $absoluteSource,
    $packagePath,
    "--report",
    $reportPath,
    "--quiet-warnings"
  )

  if ($RedactSourcePaths) {
    $arguments += "--redact-source-paths"
  }

  Write-Host "Packaging $absoluteSource"
  & node "--max-old-space-size=$NodeMaxOldSpaceMb" @arguments
  if ($LASTEXITCODE -ne 0) {
    throw "Kairo package import failed for '$absoluteSource' with exit code $LASTEXITCODE."
  }

  $report = Get-Content -LiteralPath $reportPath -Raw | ConvertFrom-Json
  $results += [pscustomobject]@{
    Input = $absoluteSource
    Package = $packagePath
    Report = $reportPath
    ConversionPercent = $report.import.coverage.conversionPercent
    FailedInstances = $report.import.coverage.failedInstances
    PackageBytes = $report.packageBytes
    Units = $report.scene.units
  }
}

$summaryPath = Join-Path $OutputDirectory "kairo-package-summary.csv"
$results | Export-Csv -Path $summaryPath -NoTypeInformation
Write-Host "Summary: $summaryPath"
