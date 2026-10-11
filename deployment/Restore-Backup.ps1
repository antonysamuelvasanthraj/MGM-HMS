[CmdletBinding()]
param([Parameter(Mandatory)][string]$Backup,[Parameter(Mandatory)][string]$Destination)
$ErrorActionPreference='Stop'
$node=Join-Path $PSScriptRoot '..\runtime\node.exe'
if(!(Test-Path -LiteralPath $node)){$node=(Get-Command node.exe).Source}
$Backup=[IO.Path]::GetFullPath($Backup)
$Destination=[IO.Path]::GetFullPath($Destination)
if($Destination.StartsWith('\\')){throw 'Restore to a local drive.'}
if(Test-Path -LiteralPath $Destination){throw 'Destination must be a NEW directory. This tool never overwrites hospital data.'}
& $node (Join-Path $PSScriptRoot 'backup.mjs') verify $Backup
if($LASTEXITCODE -ne 0){throw 'Backup verification failed; nothing restored.'}
$manifest=Get-Content -LiteralPath (Join-Path $Backup 'manifest.json') -Raw | ConvertFrom-Json
New-Item -ItemType Directory -Path $Destination | Out-Null
foreach($f in $manifest.files){
  $target=[IO.Path]::GetFullPath((Join-Path $Destination $f.path))
  if(!$target.StartsWith($Destination.TrimEnd('\')+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Unsafe backup path'}
  New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $Backup $f.path) -Destination $target
  $stream=[IO.File]::OpenRead($target); $sha=[Security.Cryptography.SHA256]::Create()
  try { $digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','').ToLower() } finally {$stream.Dispose();$sha.Dispose()}
  if($digest -ne $f.sha256){throw 'Restored file checksum mismatch'}
}
Write-Host "Verified backup restored into $Destination. The running server has NOT been changed. Follow the guide to switch dataDir during maintenance."
