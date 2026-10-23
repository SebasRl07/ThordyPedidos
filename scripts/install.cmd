@echo off
cd /d "%~dp0.."
call npm ci
if errorlevel 1 exit /b 1
call npm run init
if errorlevel 1 exit /b 1
call npm run build
if errorlevel 1 exit /b 1
call npm run admin -- --if-empty
if errorlevel 1 exit /b 1
pause
