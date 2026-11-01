@echo off
title MGM HMS server
cd /d "E:\MGM HMS"
set HMS_ENV=production
set NODE_ENV=production
set HMS_TRUST_PROXY=1
if not exist data\logs mkdir data\logs
echo MGM HMS server is running. Output: data\logs\live-server.log
echo Close this window to stop the server. It restarts by itself if it ever exits.
:loop
echo [%date% %time%] starting server>> data\logs\live-server.log
call npm start >> data\logs\live-server.log 2>&1
echo [%date% %time%] server exited with code %errorlevel% - restarting in 5 seconds>> data\logs\live-server.log
echo [%date% %time%] server exited - restarting in 5 seconds
timeout /t 5 /nobreak >nul
goto loop
