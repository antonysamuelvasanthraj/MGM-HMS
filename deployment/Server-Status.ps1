param([string]$Config = "$env:ProgramData\MGMHMS\server-config.json")
$ErrorActionPreference='Stop'
$c=Get-Content -LiteralPath $Config -Raw | ConvertFrom-Json
Get-ScheduledTask -TaskName 'MGM-HMS-Server' -ErrorAction SilentlyContinue | Select-Object TaskName,State
Get-ScheduledTaskInfo -TaskName 'MGM-HMS-Server' -ErrorAction SilentlyContinue | Select-Object LastRunTime,LastTaskResult,NextRunTime
try { Invoke-RestMethod "http://127.0.0.1:$($c.port)/api/health" -TimeoutSec 5 | Format-List } catch { Write-Warning "Application unavailable: $_" }
$status=Join-Path $c.logDir 'status.json'
if(Test-Path -LiteralPath $status){Get-Content -LiteralPath $status}
Get-PSDrive -PSProvider FileSystem | Select-Object Name,Used,Free
