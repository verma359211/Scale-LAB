$ErrorActionPreference = "Stop"

$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resetFile = Join-Path $repositoryPath "load-tests\reset-write-test.sql"

Write-Host "Resetting benchmark orders and stock..."
foreach ($pod in @("postgres-0", "postgres-shard-1-0")) {
  Get-Content -Raw $resetFile | kubectl exec -i $pod -n scalelab -- `
    psql -v ON_ERROR_STOP=1 -U scalelab -d scalelab
  if ($LASTEXITCODE -ne 0) {
    throw "PostgreSQL benchmark reset failed on $pod."
  }
}

# Benchmark products can enter Redis through direct product reads. Clearing the
# disposable cache makes every run begin from the same state.
kubectl exec deployment/redis -n scalelab -- redis-cli FLUSHDB | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Redis reset failed."
}

Write-Host "Write-test state reset: 100 products, 10,000,000 stock each."
