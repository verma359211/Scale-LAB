$ErrorActionPreference = "Stop"
$repositoryPath = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
Push-Location $repositoryPath
try {
  $problems = @()
  $signature = '-----BEGIN (RSA |OPENSSH |EC )?PRIVATE KEY-----|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{15,}'
  foreach ($path in @(git ls-files)) {
    $privateEnv = $path -match '(^|/)\.env($|\.)' -and $path -notmatch '(^|/)\.env\.example$'
    if ($privateEnv -or $path -match '(^|/)(node_modules|dist|coverage|\.pnpm-store|\.codex|\.agents|\.aws|\.ssh|\.kube|\.docker|secrets)/|^docs/experiments/results/|\.(pem|key|p12|pfx|kubeconfig|log|ndjson|cpuprofile|heapsnapshot|tsbuildinfo|bak|tmp)$|\.secrets?\.(yaml|json)$|(^|/)[^/]*kubeconfig[^/]*$') {
      $problems += "Excluded artifact/private-looking path: $path"
    }
    if (!(Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    $text = Get-Content -LiteralPath $path -Raw
    if ($text -match $signature) { $problems += "Credential signature: $path (value suppressed)" }
    if ($path -like 'infrastructure/kubernetes/civo/*.yaml' -and $text -match '(?m)^kind: Secret\s*$') {
      $problems += "Cloud Secret values must be managed privately: $path"
    }
  }
  if ($problems.Count) { $problems | ForEach-Object { Write-Output $_ }; throw "Repository hygiene check failed ($($problems.Count) findings)." }
  Write-Output "Repository hygiene passed. Review the staged diff and generic credentials manually; see docs/REPOSITORY_HYGIENE.md."
} finally { Pop-Location }
