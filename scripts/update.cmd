@echo off
setlocal
cd /d "%~dp0.."
set "THORDY_NO_PAUSE="
if /I "%~1"=="--no-pause" set "THORDY_NO_PAUSE=1"
echo THORDY - Actualizacion segura
echo Cierra el servidor con Ctrl+C antes de continuar.
where node >nul 2>nul
if errorlevel 1 (
  echo Instala Node.js 24 antes de actualizar.
  if not defined THORDY_NO_PAUSE pause
  exit /b 1
)
node scripts\update.mjs
if errorlevel 1 (
  echo No se completo la actualizacion. Lee el mensaje anterior; no borres data ni .env.
  if not defined THORDY_NO_PAUSE pause
  exit /b 1
)
if not defined THORDY_NO_PAUSE pause
exit /b 0
