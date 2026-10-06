$ErrorActionPreference = "Stop"

Write-Host "Watching ScaleLab pods and HPA. Press Ctrl+C to stop."

while ($true) {
  Clear-Host
  Write-Host "ScaleLab Kubernetes - $(Get-Date -Format 'HH:mm:ss')"
  Write-Host ""

  kubectl get pods -n scalelab
  Write-Host ""
  kubectl get hpa scalelab-api -n scalelab

  Start-Sleep -Seconds 3
}
