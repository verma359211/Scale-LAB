$ErrorActionPreference = "Stop"

$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$controllerVersion = "controller-v1.15.1"
$controllerManifest = "https://raw.githubusercontent.com/kubernetes/ingress-nginx/$controllerVersion/deploy/static/provider/cloud/deploy.yaml"

# ingress-nginx is cluster infrastructure, so install it before applying the
# ScaleLab namespace that contains the application-specific Ingress rules.
kubectl apply -f $controllerManifest | Out-Host
$controllerArgs = kubectl get deployment ingress-nginx-controller -n ingress-nginx -o jsonpath="{.spec.template.spec.containers[0].args}"
if ($controllerArgs -notmatch "--enable-metrics=true") {
  kubectl patch deployment ingress-nginx-controller `
    --namespace ingress-nginx `
    --type=json `
    --patch-file (Join-Path $repositoryPath "infrastructure\kubernetes\ingress-metrics-patch.json") | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Could not enable ingress-nginx metrics."
  }
}
if ($controllerArgs -notmatch "--metrics-per-host=false") {
  kubectl patch deployment ingress-nginx-controller `
    --namespace ingress-nginx `
    --type=json `
    --patch-file (Join-Path $repositoryPath "infrastructure\kubernetes\ingress-wildcard-metrics-patch.json") | Out-Host
  if ($LASTEXITCODE -ne 0) {
    throw "Could not configure bounded metrics for the hostless ScaleLab Ingress."
  }
}
kubectl rollout status deployment/ingress-nginx-controller `
  --namespace ingress-nginx `
  --timeout=5m | Out-Host

kubectl apply -k (Join-Path $repositoryPath "infrastructure\kubernetes") | Out-Host
kubectl rollout restart deployment/prometheus -n scalelab | Out-Host
kubectl rollout status deployment/prometheus -n scalelab --timeout=5m | Out-Host

Write-Host "ScaleLab applied. The in-cluster load test enters through ingress-nginx."
