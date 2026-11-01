$ErrorActionPreference = 'Stop'
$serviceConfigPath = Join-Path $PSScriptRoot 'server.config.json'
if (-not (Test-Path -LiteralPath $serviceConfigPath)) { throw 'Copia server.config.example.json in server.config.json e indica il certificato HTTPS aziendale e la chiave prima di avviare la rete.' }
$serviceConfig = Get-Content -LiteralPath $serviceConfigPath -Raw | ConvertFrom-Json
if (-not $serviceConfig.certificateFile -or -not $serviceConfig.privateKeyFile) { throw 'Certificato e chiave HTTPS richiesti.' }
$serviceCertificate = if ([System.IO.Path]::IsPathRooted($serviceConfig.certificateFile)) { [System.IO.Path]::GetFullPath($serviceConfig.certificateFile) } else { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $serviceConfig.certificateFile)) }
$servicePrivateKey = if ([System.IO.Path]::IsPathRooted($serviceConfig.privateKeyFile)) { [System.IO.Path]::GetFullPath($serviceConfig.privateKeyFile) } else { [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot $serviceConfig.privateKeyFile)) }
if (-not (Test-Path -LiteralPath $serviceCertificate) -or -not (Test-Path -LiteralPath $servicePrivateKey)) { throw 'File HTTPS non trovati. Chiedi al referente IT il certificato valido per il nome interno del servizio.' }
$env:SPAZI_CERT = $serviceCertificate
$env:SPAZI_KEY = $servicePrivateKey
$env:SPAZI_HOST = '0.0.0.0'
$env:SPAZI_PORT = if ($serviceConfig.port) { "$($serviceConfig.port)" } else { '8770' }
$serviceNode = (Get-Command node -ErrorAction Stop).Source
if ((& $serviceNode --version) -notmatch '^v24\.') { throw 'Installa Node 24 per avviare la versione collaudata di Spazi.' }
Start-Process -FilePath $serviceNode -ArgumentList 'server/server.mjs' -WorkingDirectory $PSScriptRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $PSScriptRoot 'network-output.log') -RedirectStandardError (Join-Path $PSScriptRoot 'network-error.log')
Write-Output "Servizio avviato sulla porta $env:SPAZI_PORT. Usa il nome DNS del certificato aziendale."
