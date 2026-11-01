@echo off
title MGM HMS public tunnel
REM Public HTTPS link (the HMS server must be running: start-live.cmd). Restarts by itself if it stops.
REM Each restart gets a NEW link, saved in data\public-url.txt. Log: data\logs	unnel.log
cd /d "E:\MGM HMS"
:loop
call npm run tunnel
echo [%date% %time%] tunnel stopped - restarting in 10 seconds (the link will change)
timeout /t 10 /nobreak >nul
goto loop
