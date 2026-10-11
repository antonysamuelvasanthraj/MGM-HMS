[CmdletBinding()]
param([string]$OutputParent)
$ErrorActionPreference='Stop'
$appDir=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (!$OutputParent) { $OutputParent=Join-Path $appDir 'release' }
$node=(Get-Command node.exe).Source
if(!((& $node --version).StartsWith('v24.'))){throw 'Use the tested Node 24 runtime.'}
$folder=Join-Path ([IO.Path]::GetFullPath($OutputParent)) ('MGM-HMS-Local-'+(Get-Date -Format 'yyyyMMdd-HHmmss'))
if(Test-Path -LiteralPath $folder){throw 'Output already exists'}
New-Item -ItemType Directory -Path $folder -Force | Out-Null
foreach($name in @('server','client','deployment','node_modules')){Copy-Item -LiteralPath (Join-Path $appDir $name) -Destination (Join-Path $folder $name) -Recurse}
foreach($name in @('package.json','package-lock.json','LOCAL-SERVER-GUIDE.md')){Copy-Item -LiteralPath (Join-Path $appDir $name) -Destination $folder}
# package.json's prestart hook must also work in the offline distribution.
New-Item -ItemType Directory -Path (Join-Path $folder 'tools') | Out-Null
Copy-Item -LiteralPath (Join-Path $appDir 'tools\ensure-css.mjs') -Destination (Join-Path $folder 'tools\ensure-css.mjs')
New-Item -ItemType Directory -Path (Join-Path $folder 'runtime') | Out-Null
Copy-Item -LiteralPath $node -Destination (Join-Path $folder 'runtime\node.exe')
$license=Join-Path (Split-Path -Parent $node) 'LICENSE'
if (!(Test-Path -LiteralPath $license)) { $license=Join-Path $PSScriptRoot 'NODE-LICENSE.txt' }
if(Test-Path -LiteralPath $license){Copy-Item -LiteralPath $license -Destination (Join-Path $folder 'runtime\LICENSE')}
else{throw 'Node runtime LICENSE is missing; add it before distributing this package.'}
$hashes=Get-ChildItem -LiteralPath $folder -Recurse -File | ForEach-Object {
  $stream=[IO.File]::OpenRead($_.FullName);$sha=[Security.Cryptography.SHA256]::Create()
  try { $digest=[BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-','') } finally {$stream.Dispose();$sha.Dispose()}
  @{path=$_.FullName.Substring($folder.Length+1);sha256=$digest}
}
$hashes | ConvertTo-Json -Depth 3 | Set-Content -LiteralPath (Join-Path $folder 'release-manifest.json') -Encoding UTF8
Write-Host "Offline package: $folder"
Write-Host 'Contains runtime and dependencies; excludes the hospital database, uploads, logs and credentials. Copy the entire directory to the hospital server.'
