param(
  [Parameter(Mandatory = $true)]
  [int]$TargetRps,
  [string]$Duration = "2m",
  [int]$PreAllocatedVUs = 500,
  [int]$MaxVUs = 3000
)

$ErrorActionPreference = "Stop"
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultDirectory = Join-Path $repositoryPath "docs\experiments\results"
$runningServices = @(docker compose -f (Join-Path $repositoryPath "compose.yaml") ps --services --status running)
$requiredServices = @("postgres", "redis", "api-1", "api-2", "api-3", "nginx")

foreach ($service in $requiredServices) {
  if ($service -notin $runningServices) {
    throw "Service '$service' is not running. Run 'pnpm stack:up' first."
  }
}

New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$resultName = "capacity-${TargetRps}rps-${timestamp}.json"
$containerResultPath = "/results/$resultName"

Push-Location $repositoryPath
try {
  docker compose --profile tools run --rm `
    -e TARGET_RPS=$TargetRps `
    -e DURATION=$Duration `
    -e PRE_VUS=$PreAllocatedVUs `
    -e MAX_VUS=$MaxVUs `
    k6 run `
    --summary-export=$containerResultPath `
    /scripts/capacity.js

  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
