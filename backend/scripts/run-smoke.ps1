param(
  [Parameter(Mandatory = $true)][string]$Test,
  [string]$DbPath = "./data/smoke-tmp.db",
  [string]$Port = "3021"
)

# Restart backend on an isolated test DB, wait until ready, then run a smoke script.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..\..\backend

Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2
Remove-Item ($DbPath -replace '\.db', '*.db*') -Force -ErrorAction SilentlyContinue

$env:DB_DATABASE = $DbPath
$env:APP_PORT = $Port
$env:API_BASE = "http://127.0.0.1:$Port/api"

$proc = Start-Process -FilePath "C:\Program Files\nodejs\node.exe" `
  -ArgumentList "dist/main.js" -WorkingDirectory (Get-Location) `
  -RedirectStandardOutput "$env:TEMP\smoke-server.log" `
  -RedirectStandardError "$env:TEMP\smoke-server.err" -NoNewWindow -PassThru

$ready = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Milliseconds 500
  try {
    Invoke-WebRequest -Uri $env:API_BASE -Method GET -TimeoutSec 2 -UseBasicParsing | Out-Null
    $ready = $true
    break
  } catch {
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode.value__ -ge 400) {
      $ready = $true
      break
    }
  }
}

if (-not $ready) {
  Write-Output "server not ready, log tail:"
  Get-Content "$env:TEMP\smoke-server.err" -Tail 30
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
  exit 1
}

& "C:\Program Files\nodejs\node.exe" "test/$Test"
$code = $LASTEXITCODE

Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
exit $code
