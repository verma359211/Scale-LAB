$ErrorActionPreference = "Stop"

$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$resultDirectory = Join-Path $repositoryPath "docs\experiments\results"
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$summaryFileName = "kubernetes-autoscale-ingress-$timestamp.json"
$summaryPath = Join-Path $resultDirectory $summaryFileName
$summaryRelativePath = Join-Path "docs\experiments\results" $summaryFileName
$eventsPath = Join-Path $resultDirectory "kubernetes-autoscale-ingress-$timestamp-events.txt"

New-Item -ItemType Directory -Force -Path $resultDirectory | Out-Null

kubectl get deployment scalelab-api -n scalelab | Out-Null
kubectl delete job autoscale-load-test -n scalelab --ignore-not-found | Out-Null
kubectl apply -f (Join-Path $repositoryPath "infrastructure\kubernetes\load-test.yaml") | Out-Host

kubectl wait --for=condition=Ready pod -l app=autoscale-load-test -n scalelab --timeout=120s | Out-Host
$podName = kubectl get pod -l app=autoscale-load-test -n scalelab -o jsonpath="{.items[0].metadata.name}"

Write-Host "Watching k6. In another terminal run: pnpm k8s:watch"
kubectl logs -f $podName -n scalelab -c k6

# k6 has stopped, but result-reader is still alive on the same emptyDir volume.
Push-Location $repositoryPath
try {
  # A relative destination avoids kubectl treating the colon in a Windows
  # absolute path (C:\...) as a second remote file specification.
  kubectl cp -c result-reader "scalelab/${podName}:/results/autoscale-summary.json" $summaryRelativePath | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Could not copy the k6 summary; result-reader was left running for recovery."
  }
} finally {
  Pop-Location
}
kubectl exec $podName -n scalelab -c result-reader -- touch /results/copied
kubectl get events -n scalelab --sort-by=.metadata.creationTimestamp | Out-File -FilePath $eventsPath -Encoding utf8

$pod = kubectl get pod $podName -n scalelab -o json | ConvertFrom-Json
$exitCode = ($pod.status.containerStatuses | Where-Object { $_.name -eq "k6" }).state.terminated.exitCode
Write-Host "k6 summary: $summaryPath"
Write-Host "Kubernetes events: $eventsPath"
exit [int]$exitCode
