param(
  [ValidateSet("hot", "distributed")]
  [string]$Mode = "hot",
  [ValidateRange(1, 10000)]
  [int]$TargetRps = 200,
  [ValidatePattern("^\d+[smh]$")]
  [string]$Duration = "4m",
  [ValidateRange(1, 10000)]
  [int]$PreAllocatedVUs = 300,
  [ValidateRange(1, 20000)]
  [int]$MaxVUs = 1500
)

$ErrorActionPreference = "Stop"

if ($MaxVUs -lt $PreAllocatedVUs) {
  throw "MaxVUs must be greater than or equal to PreAllocatedVUs."
}

$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultDirectory = Join-Path $repositoryPath "docs\experiments\results"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$baseName = "kubernetes-write-$Mode-${TargetRps}rps-$timestamp"
$summaryPath = Join-Path $resultDirectory "$baseName.json"
$summaryRelativePath = Join-Path "docs\experiments\results" "$baseName.json"
$eventsPath = Join-Path $resultDirectory "$baseName-events.txt"
$manifestPath = Join-Path $repositoryPath "infrastructure\kubernetes\write-load-test.yaml"

New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null

kubectl get deployment scalelab-api -n scalelab | Out-Null
& (Join-Path $PSScriptRoot "reset-kubernetes-write-test.ps1")

$manifest = Get-Content -Raw $manifestPath
$manifest = $manifest.Replace("__WRITE_MODE__", $Mode)
$manifest = $manifest.Replace("__TARGET_RPS__", [string]$TargetRps)
$manifest = $manifest.Replace("__DURATION__", $Duration)
$manifest = $manifest.Replace("__PRE_VUS__", [string]$PreAllocatedVUs)
$manifest = $manifest.Replace("__MAX_VUS__", [string]$MaxVUs)

kubectl delete job write-load-test -n scalelab --ignore-not-found | Out-Null
$manifest | kubectl apply -f - | Out-Host
if ($LASTEXITCODE -ne 0) {
  throw "Could not create the write-load Job."
}

kubectl wait --for=condition=Ready pod -l app=write-load-test -n scalelab --timeout=120s | Out-Host
$podName = kubectl get pod -l app=write-load-test -n scalelab -o jsonpath="{.items[0].metadata.name}"

Write-Host "Running $Mode-row write test at $TargetRps RPS for $Duration."
Write-Host "Use pnpm k8s:watch and Grafana in another window."
kubectl logs -f $podName -n scalelab -c k6

Push-Location $repositoryPath
try {
  kubectl cp -c result-reader "scalelab/${podName}:/results/write-summary.json" $summaryRelativePath | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Could not copy the k6 summary; result-reader was left running for recovery."
  }
} finally {
  Pop-Location
}

kubectl exec $podName -n scalelab -c result-reader -- touch /results/copied | Out-Null
kubectl get events -n scalelab --sort-by=.metadata.creationTimestamp | Out-File -FilePath $eventsPath -Encoding utf8

$pod = kubectl get pod $podName -n scalelab -o json | ConvertFrom-Json
$exitCode = ($pod.status.containerStatuses | Where-Object { $_.name -eq "k6" }).state.terminated.exitCode
Write-Host "k6 summary: $summaryPath"
Write-Host "Kubernetes events: $eventsPath"
exit [int]$exitCode
