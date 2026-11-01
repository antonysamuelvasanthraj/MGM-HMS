@echo off
REM Stops the background HMS server and public link started by start-demo.cmd.
cd /d "E:\MGM HMS"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter 'Name=''cmd.exe''' | Where-Object { $_.CommandLine -match 'start-live\.cmd|start-tunnel\.cmd' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }; Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force; $c = Get-NetTCPConnection -LocalPort 4300 -State Listen -ErrorAction SilentlyContinue; if ($c) { Stop-Process -Id $c.OwningProcess -Force -ErrorAction SilentlyContinue }; 'HMS server and public link stopped.'"
pause
