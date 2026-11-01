@echo off
REM Shows whether the HMS server and the public link are running, and the link to share.
cd /d "E:\MGM HMS"
powershell -NoProfile -Command "$h = try { (Invoke-RestMethod -TimeoutSec 5 http://localhost:4300/api/health).health } catch { 'NOT RUNNING' }; $t = if (Get-Process cloudflared -ErrorAction SilentlyContinue) { 'running' } else { 'NOT RUNNING' }; ''; 'HMS server    : ' + $h; 'Public link   : ' + $t; 'Link to share : ' + (Get-Content 'E:\MGM HMS\data\public-url.txt' -ErrorAction SilentlyContinue); ''"
pause
