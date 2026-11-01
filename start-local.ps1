$ErrorActionPreference = 'Stop'
$previewRoot = Join-Path $PSScriptRoot 'dist'
$previewNode = (Get-Command node -ErrorAction Stop).Source
if ((& $previewNode --version) -notmatch '^v24\.') { throw 'Installa Node 24 per avviare la versione collaudata di Spazi.' }
try {
    $previewResponse = Invoke-WebRequest -Uri 'http://127.0.0.1:8766/api/session' -UseBasicParsing -TimeoutSec 2
    if ($previewResponse.StatusCode -eq 200) {
        Start-Process 'http://127.0.0.1:8766/'
        exit
    }
} catch {}
$previewPort = 8766
if (Get-NetTCPConnection -LocalPort $previewPort -State Listen -ErrorAction SilentlyContinue) { $previewPort = 8767 }
$env:SPAZI_PORT = "$previewPort"
$env:SPAZI_HOST = '127.0.0.1'
Start-Process -FilePath $previewNode -ArgumentList 'server/server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden
Start-Sleep -Milliseconds 700
Start-Process "http://127.0.0.1:$previewPort/"
