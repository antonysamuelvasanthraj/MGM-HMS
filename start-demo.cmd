@echo off
REM One click: HMS server (demo mode) + public HTTPS tunnel, each in its own window.
cd /d "E:\MGM HMS"
start "MGM HMS DEMO server" cmd /k "set HMS_ENV=demo&& set HMS_TRUST_PROXY=1&& npm start"
timeout /t 12 /nobreak >nul
start "MGM HMS public tunnel" cmd /k "npm run tunnel"
