@echo off
REM One click: HMS server + public HTTPS link, both running in the background (no windows to close by accident).
REM Each restarts by itself if it stops. Logs: data\logs\live-server.log and data\logs\tunnel.log
REM See the link: status-demo.cmd     Stop everything: stop-demo.cmd
cd /d "E:\MGM HMS"
powershell -NoProfile -Command "try { Invoke-RestMethod -TimeoutSec 4 http://localhost:4300/api/health | Out-Null; 'HMS server already running.' } catch { Start-Process -WindowStyle Hidden -FilePath cmd.exe -ArgumentList '/c', '\"E:\MGM HMS\start-live.cmd\"'; 'Starting the HMS server in the background...' }"
timeout /t 12 /nobreak >nul
powershell -NoProfile -Command "if (Get-Process cloudflared -ErrorAction SilentlyContinue) { 'Public link already running.' } else { Start-Process -WindowStyle Hidden -FilePath cmd.exe -ArgumentList '/c', '\"E:\MGM HMS\start-tunnel.cmd\"'; 'Starting the public link in the background...' }"
timeout /t 20 /nobreak >nul
call "E:\MGM HMS\status-demo.cmd"
