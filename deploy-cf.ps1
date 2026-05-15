param(
  [string]$ProjectName = "kairo-viewer",
  [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$viewerDist = Join-Path $repoRoot "apps/viewer/dist"
$stagedScottScene = Join-Path $viewerDist "scenes/scott-dxf2013-import"

Push-Location $repoRoot
try {
  pnpm build

  if (Test-Path -LiteralPath $stagedScottScene) {
    Remove-Item -Recurse -Force -LiteralPath $stagedScottScene
  }

  pnpm dlx wrangler pages deploy $viewerDist --project-name $ProjectName --branch $Branch
} finally {
  Pop-Location
}
