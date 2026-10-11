@echo off
title MGM HMS DEMO server
cd /d "E:\MGM HMS"
set HMS_ENV=demo
set HMS_TRUST_PROXY=1
npm start
pause
