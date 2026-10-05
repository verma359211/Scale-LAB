param(
  [string]$Duration = "4m",
  [int]$IntervalSeconds = 60,
  [int]$PreAllocatedVUs = 2000,
  [int]$MaxVUs = 6000
)

$ErrorActionPreference = "Stop"
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$singleTestScript = Join-Path $PSScriptRoot "run-load-test.ps1"
$targetRates = @(2500, 3000, 3500)
$results = @()

Push-Location $repositoryPath
try {
  for ($index = 0; $index -lt $targetRates.Count; $index++) {
    $targetRps = $targetRates[$index]

    Write-Host ""
    Write-Host "Starting capacity test: $targetRps RPS for $Duration"
    Write-Host "VUs: $PreAllocatedVUs preallocated, $MaxVUs maximum"

    & powershell -NoProfile -ExecutionPolicy Bypass -File $singleTestScript `
      -TargetRps $targetRps `
      -Duration $Duration `
      -PreAllocatedVUs $PreAllocatedVUs `
      -MaxVUs $MaxVUs

    $testExitCode = $LASTEXITCODE
    $results += [PSCustomObject]@{
      TargetRps = $targetRps
      ExitCode = $testExitCode
      Result = if ($testExitCode -eq 0) { "Passed" } else { "Failed" }
    }

    if ($index -lt ($targetRates.Count - 1)) {
      Write-Host ""
      Write-Host "Waiting $IntervalSeconds seconds before the next test..."
      Start-Sleep -Seconds $IntervalSeconds
    }
  }
}
finally {
  Pop-Location
}

Write-Host ""
Write-Host "Capacity suite complete:"
$results | Format-Table -AutoSize

$failedTests = @($results | Where-Object { $_.ExitCode -ne 0 })
if ($failedTests.Count -gt 0) {
  exit 1
}

exit 0
