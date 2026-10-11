#Requires -RunAsAdministrator
[CmdletBinding()]
param(
  [string]$DataDir = "$env:ProgramData\MGMHMS\data",
  [string]$BackupDir = "$env:ProgramData\MGMHMS\backups",
  [ValidateRange(1024,65535)][int]$Port = 4300,
  [switch]$InitializeNewHospital,
  [switch]$OpenLanFirewall
)
$ErrorActionPreference = 'Stop'
$appDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$node = Join-Path $appDir 'runtime\node.exe'
if (!(Test-Path -LiteralPath $node)) { $node = (Get-Command node.exe -ErrorAction Stop).Source }
$major = [int]((& $node --version).TrimStart('v').Split('.')[0])
if ($major -ne 24) { throw 'This release is tested with Node 24. Use the bundled runtime.' }
foreach ($required in @('server\index.js','client\app.css','node_modules\express\package.json','node_modules\ws\package.json')) {
  if (!(Test-Path -LiteralPath (Join-Path $appDir $required))) { throw "Incomplete offline installation: $required" }
}
foreach ($dir in @($DataDir,$BackupDir,$appDir)) {
  if (![IO.Path]::IsPathRooted($dir) -or $dir.StartsWith('\\')) { throw 'Use absolute local-drive paths, not network shares.' }
}
$DataDir = [IO.Path]::GetFullPath($DataDir)
$BackupDir = [IO.Path]::GetFullPath($BackupDir)
$stateDir = Join-Path $env:ProgramData 'MGMHMS'
$logDir = Join-Path $stateDir 'logs'
$configPath = Join-Path $stateDir 'server-config.json'
if (Get-ScheduledTask -TaskName 'MGM-HMS-Server' -ErrorAction SilentlyContinue) { throw 'MGM-HMS-Server already exists. Use the maintenance guide; do not reinstall over a running server.' }
if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { throw "Port $Port is in use. Stop the old HMS during the maintenance window or choose another port. No process was stopped." }
$db = Join-Path $DataDir 'surelyhms.db'
if (!(Test-Path -LiteralPath $db) -and !$InitializeNewHospital) { throw 'No hospital database found. Supply the existing DataDir, restore a backup, or use -InitializeNewHospital for a NEW hospital.' }
if ((Test-Path -LiteralPath $db) -and $InitializeNewHospital) { throw 'Existing database found. Omit -InitializeNewHospital; existing records must be preserved.' }
foreach ($dir in @($stateDir,$DataDir,$BackupDir,$logDir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
$config = @{ appDir=$appDir; dataDir=$DataDir; backupDir=$BackupDir; logDir=$logDir; port=$Port; host='0.0.0.0'; backupHours=6; keepBackups=28 }
if (Test-Path -LiteralPath $configPath) { throw "Configuration already exists at $configPath. Inspect it before reinstalling." }
$config | ConvertTo-Json | Set-Content -LiteralPath $configPath -Encoding UTF8
# Validate paths before initialization or creating a persistent task.
& $node (Join-Path $PSScriptRoot 'config.mjs') $configPath
if ($LASTEXITCODE -ne 0) { throw 'Configuration validation failed.' }
if ($InitializeNewHospital) {
  $previousData = $env:SURELY_DATA
  try {
    $env:SURELY_DATA=$DataDir
    Push-Location $appDir
    try { & $node --input-type=module -e "import {seed} from './server/seed.js'; import {db} from './server/db.js'; seed(); db.close();" } finally { Pop-Location }
    if ($LASTEXITCODE -ne 0) { throw 'Hospital initialization failed.' }
  } finally { $env:SURELY_DATA=$previousData }
}
# Back up existing records before the service performs any migrations.
& $node (Join-Path $PSScriptRoot 'backup.mjs') $configPath
if ($LASTEXITCODE -ne 0) { throw 'Pre-install backup failed. Task not installed.' }
# Run with the built-in least-privilege Local Service account, not a staff login.
& icacls.exe $appDir /grant '*S-1-5-19:(OI)(CI)RX' /T /Q | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not grant application read access.' }
foreach ($dir in @($DataDir,$BackupDir,$logDir)) {
  & icacls.exe $dir /grant '*S-1-5-19:(OI)(CI)M' /T /Q | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not grant service access to $dir" }
}
& icacls.exe $stateDir /grant '*S-1-5-19:RX' | Out-Null
& icacls.exe $configPath /grant '*S-1-5-19:R' | Out-Null
$action = New-ScheduledTaskAction -Execute $node -Argument ('"{0}" "{1}"' -f (Join-Path $PSScriptRoot 'supervisor.mjs'),$configPath) -WorkingDirectory $appDir
$boot = New-ScheduledTaskTrigger -AtStartup
$retry = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(5) -RepetitionInterval (New-TimeSpan -Minutes 5)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
$principal = New-ScheduledTaskPrincipal -UserId 'S-1-5-19' -LogonType ServiceAccount
Register-ScheduledTask -TaskName 'MGM-HMS-Server' -Action $action -Trigger @($boot,$retry) -Settings $settings -Principal $principal -Description 'Local MGM HMS with health recovery, bounded logs and verified backups.' | Out-Null
if ($OpenLanFirewall) {
  New-NetFirewallRule -DisplayName 'MGM HMS - Hospital LAN' -Direction Inbound -Action Allow -Protocol TCP -LocalPort $Port -Profile Domain,Private -RemoteAddress LocalSubnet -Program $node | Out-Null
}
Start-ScheduledTask -TaskName 'MGM-HMS-Server'
$healthy=$false
for($i=0;$i -lt 30;$i++) {
  Start-Sleep -Seconds 2
  try { $health=Invoke-RestMethod "http://127.0.0.1:$Port/api/health" -TimeoutSec 2; if($health.status -eq 'ok' -and $health.service -eq 'mgm-hms'){$healthy=$true;break} } catch {}
}
if (!$healthy) { throw "Task installed but health check failed. Read $logDir\server.log and Task Scheduler Last Run Result." }
Write-Host "MGM HMS is running at http://localhost:$Port"
Write-Host "Config: $configPath"
Write-Host 'Before staff use: replace default passwords, configure hospital details, and perform the reboot/LAN/restore checks in LOCAL-SERVER-GUIDE.md.'
